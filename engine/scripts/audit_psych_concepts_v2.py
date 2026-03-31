"""Audit PubTator concepts for psychiatric disorders + neuropsych phenotypes.

Strategy: Single table scan with batch LIKE matching via ANY/array,
then filter/classify in Python.
"""

import json, sys, time
from app import db

# All search terms grouped by category
CATEGORIES = {
    # PRIMARY PSYCHIATRIC DISORDERS
    "Schizophrenia Spectrum": [
        'schizophrenia', 'schizoaffective', 'schizophreniform',
        'brief psychotic disorder', 'delusional disorder', 'psychotic disorder',
    ],
    "Bipolar Spectrum": [
        'bipolar disorder', 'bipolar i', 'bipolar ii', 'bipolar depression',
        'cyclothymia', 'mania', 'hypomania',
    ],
    "Depressive Disorders": [
        'major depressive', 'major depression', 'persistent depressive', 'dysthymia',
        'seasonal affective', 'postpartum depression', 'treatment-resistant depression',
        'treatment resistant depression',
    ],
    "Anxiety Disorders": [
        'generalized anxiety', 'panic disorder', 'social anxiety', 'social phobia',
        'agoraphobia', 'specific phobia', 'separation anxiety',
    ],
    "OCD Spectrum": [
        'obsessive-compulsive disorder', 'obsessive compulsive disorder',
        'body dysmorphic', 'hoarding disorder', 'trichotillomania', 'excoriation',
    ],
    "Trauma and Stress": [
        'post-traumatic stress', 'posttraumatic stress', 'ptsd',
        'acute stress disorder', 'adjustment disorder',
    ],
    "Personality Disorders": [
        'borderline personality', 'antisocial personality', 'narcissistic personality',
        'avoidant personality', 'schizotypal',
    ],
    "Eating Disorders": [
        'anorexia nervosa', 'bulimia nervosa', 'binge eating',
    ],
    "Substance Use Disorders": [
        'alcohol use disorder', 'alcoholism', 'opioid use disorder', 'opioid dependence',
        'stimulant use', 'cocaine dependence', 'cannabis use disorder',
    ],
    "Neurodevelopmental": [
        'attention deficit', 'adhd', 'autism spectrum', 'autistic disorder',
    ],
    "Dissociative Disorders": [
        'dissociative identity', 'depersonalization', 'derealization',
        'dissociative amnesia',
    ],
    "Somatic/Functional": [
        'somatic symptom', 'conversion disorder', 'functional neurological',
        'illness anxiety', 'hypochondriasis',
    ],
    "Sleep Disorders": [
        'insomnia', 'narcolepsy', 'rem sleep behavior', 'restless legs',
        'circadian rhythm',
    ],
    "Suicidality": [
        'suicide', 'suicidal ideation', 'self-harm', 'deliberate self',
    ],
    # NEUROPSYCHIATRIC PHENOTYPES
    "Psychosis Phenotypes": [
        'psychosis', 'hallucinations', 'auditory hallucinations',
        'visual hallucinations', 'delusions', 'paranoia', 'paranoid',
    ],
    "Catatonia/Mutism": [
        'catatonia', 'mutism', 'stupor',
    ],
    "Agitation/Aggression": [
        'agitation', 'aggression', 'irritability', 'hostility',
    ],
    "Apathy/Motivation": [
        'apathy', 'abulia', 'avolition',
    ],
    "Impulsivity": [
        'impulsivity', 'disinhibition', 'impulsive',
    ],
    "Emotional Dysregulation": [
        'emotional lability', 'pseudobulbar affect', 'pathological laughing',
        'pathological crying',
    ],
    "Executive/Frontal": [
        'executive dysfunction', 'frontal lobe syndrome',
    ],
    "Memory/Amnesia": [
        'amnesia', 'memory impairment', 'memory loss',
    ],
    "Personality Change": [
        'personality change', 'personality disorder',
    ],
    "Dissociation Phenotypes": [
        'dissociation', 'fugue',
    ],
    "Anhedonia/Anergia": [
        'anhedonia', 'anergia',
    ],
    "Cognitive": [
        'cognitive impairment', 'cognitive decline', 'neurocognitive',
    ],
    "Delirium": [
        'delirium', 'acute confusional',
    ],
}

# Flatten all terms
all_terms = []
term_to_categories = {}
for cat, terms in CATEGORIES.items():
    for t in terms:
        if t not in term_to_categories:
            all_terms.append(t)
            term_to_categories[t] = []
        term_to_categories[t].append(cat)


def build_like_clause(terms):
    """Build SQL: lower(mentions) LIKE ANY(ARRAY[...])"""
    patterns = [f'%{t}%' for t in terms]
    return patterns


def main():
    print(f"Searching {len(all_terms)} terms across {len(CATEGORIES)} categories", flush=True)

    # Process in batches of ~15 terms to keep queries manageable
    batch_size = 15
    term_batches = [all_terms[i:i+batch_size] for i in range(0, len(all_terms), batch_size)]

    # Store results: concept_id -> {entity_type, mentions, paper_count, matched_terms}
    concept_data = {}

    with db.pooled() as conn, conn.cursor() as cur:
        for batch_idx, batch in enumerate(term_batches):
            start = time.time()
            patterns = build_like_clause(batch)

            # Use LIKE ANY for batch matching
            cur.execute("""
                SELECT ea.concept_id, ea.entity_type,
                    MIN(ea.mentions) as sample_mention,
                    COUNT(DISTINCT ea.pmid)::integer as paper_count
                FROM pubtator.entity_annotations ea
                WHERE lower(ea.mentions) LIKE ANY(%s)
                GROUP BY ea.concept_id, ea.entity_type
                ORDER BY paper_count DESC
            """, (patterns,))

            rows = cur.fetchall()
            elapsed = time.time() - start

            # For each result, figure out which terms it matched
            for r in rows:
                cid = r['concept_id']
                key = (cid, r['entity_type'])
                if key not in concept_data:
                    concept_data[key] = {
                        'concept_id': cid,
                        'entity_type': r['entity_type'],
                        'sample_mention': r['sample_mention'],
                        'paper_count': r['paper_count'],
                        'matched_terms': set(),
                    }
                # Check which batch terms this mention matches
                mention_lower = r['sample_mention'].lower() if r['sample_mention'] else ''
                for t in batch:
                    if t in mention_lower:
                        concept_data[key]['matched_terms'].add(t)

            print(f"  Batch {batch_idx+1}/{len(term_batches)}: {len(rows)} concepts, {elapsed:.1f}s — terms: {batch[:3]}...", flush=True)

        # Now check entity_rule for all found concepts
        all_cids = list(set(k[0] for k in concept_data.keys()))
        print(f"\nChecking {len(all_cids)} concept IDs against entity_rule...", flush=True)

        entity_rules = {}
        # Batch in chunks of 500
        for i in range(0, len(all_cids), 500):
            chunk = all_cids[i:i+500]
            cur.execute("""
                SELECT concept_id, family_key, confidence
                FROM solemd.entity_rule
                WHERE concept_id = ANY(%s)
            """, (chunk,))
            for r in cur.fetchall():
                entity_rules[r['concept_id']] = {
                    'family_key': r['family_key'],
                    'confidence': float(r['confidence']) if r['confidence'] else None,
                }

        print(f"Found {len(entity_rules)} in entity_rule", flush=True)

    # Convert sets to lists for JSON serialization
    for key in concept_data:
        concept_data[key]['matched_terms'] = list(concept_data[key]['matched_terms'])

    # Save raw results
    output = {
        'concept_data': {f"{k[0]}|{k[1]}": v for k, v in concept_data.items()},
        'entity_rules': entity_rules,
    }
    with open('/tmp/psych_audit_results.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)

    # Now also do term-by-term matching using the fetched data
    # We need to re-query per term since LIKE ANY doesn't tell us WHICH pattern matched
    # But we can do this smarter: for each term, scan a sample of concept mentions

    print(f"\nTotal unique concepts: {len(concept_data)}", flush=True)
    print(f"In entity_rule: {len(entity_rules)}", flush=True)
    print(f"Missing from entity_rule: {len(set(all_cids) - set(entity_rules.keys()))}", flush=True)
    print("Results saved to /tmp/psych_audit_results.json", flush=True)


if __name__ == '__main__':
    main()
