"""Audit PubTator concepts for psychiatric disorders + neuropsych phenotypes.

Strategy: One full scan of disease-type annotations to collect all
(concept_id -> mentions) mappings, then filter in Python.
"""

import json, sys, time
from app import db

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


def main():
    # Flatten all unique terms
    all_terms = []
    term_to_cats = {}
    for cat, terms in CATEGORIES.items():
        for t in terms:
            if t not in term_to_cats:
                all_terms.append(t)
                term_to_cats[t] = []
            term_to_cats[t].append(cat)

    print(f"Total search terms: {len(all_terms)}", flush=True)
    print(f"Categories: {len(CATEGORIES)}", flush=True)

    with db.pooled() as conn, conn.cursor() as cur:
        # Step 1: Get all disease concepts with mentions summary + paper counts
        # Use a single scan: get concept_id, paper_count, and a few sample mentions
        print("\nStep 1: Scanning all disease concepts...", flush=True)
        start = time.time()
        cur.execute("""
            SELECT concept_id,
                   COUNT(DISTINCT pmid)::integer as paper_count,
                   array_agg(DISTINCT mentions ORDER BY mentions) FILTER (WHERE mentions IS NOT NULL) as mention_samples
            FROM pubtator.entity_annotations
            WHERE entity_type = 'disease'
            GROUP BY concept_id
        """)
        disease_rows = cur.fetchall()
        elapsed = time.time() - start
        print(f"  Fetched {len(disease_rows)} disease concepts in {elapsed:.0f}s", flush=True)

        # Build lookup: concept_id -> {paper_count, mentions_text}
        concept_lookup = {}
        for r in disease_rows:
            mentions = r['mention_samples'] or []
            # Combine all mentions into searchable text
            mentions_text = '|'.join(m.lower() for m in mentions)
            concept_lookup[r['concept_id']] = {
                'paper_count': r['paper_count'],
                'mentions': mentions,
                'mentions_text': mentions_text,
            }

        # Step 2: For each term, find matching concepts
        print("\nStep 2: Matching terms to concepts...", flush=True)
        # term -> list of {concept_id, paper_count, sample_mention}
        term_matches = {}
        for term in all_terms:
            matches = []
            for cid, data in concept_lookup.items():
                if term in data['mentions_text']:
                    # Find the best sample mention containing the term
                    best_mention = None
                    for m in data['mentions']:
                        if term in m.lower():
                            best_mention = m
                            break
                    matches.append({
                        'concept_id': cid,
                        'paper_count': data['paper_count'],
                        'sample_mention': best_mention or data['mentions'][0] if data['mentions'] else '',
                    })
            # Sort by paper count descending, take top 5
            matches.sort(key=lambda x: x['paper_count'], reverse=True)
            term_matches[term] = matches[:5]
            n = len(matches)
            top = matches[0]['concept_id'] if matches else 'NONE'
            print(f"  '{term}': {n} concepts (top: {top})", flush=True)

        # Step 3: Get entity_rule status for all matched concept_ids
        all_matched_cids = set()
        for matches in term_matches.values():
            for m in matches:
                all_matched_cids.add(m['concept_id'])

        print(f"\nStep 3: Checking {len(all_matched_cids)} concepts in entity_rule...", flush=True)
        entity_rules = {}
        cid_list = list(all_matched_cids)
        for i in range(0, len(cid_list), 500):
            chunk = cid_list[i:i+500]
            cur.execute("""
                SELECT concept_id, family_key, confidence
                FROM solemd.entity_rule
                WHERE concept_id = ANY(%s)
            """, (chunk,))
            for r in cur.fetchall():
                entity_rules[r['concept_id']] = {
                    'family_key': r['family_key'],
                    'confidence': str(r['confidence']) if r['confidence'] else None,
                }

    print(f"  {len(entity_rules)} found in entity_rule", flush=True)
    print(f"  {len(all_matched_cids) - len(entity_rules)} MISSING from entity_rule", flush=True)

    # Save full results
    output = {
        'term_matches': term_matches,
        'entity_rules': entity_rules,
        'categories': {cat: terms for cat, terms in CATEGORIES.items()},
    }
    with open('/tmp/psych_audit_results.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)

    # Print summary by category
    print("\n" + "="*80, flush=True)
    print("SUMMARY BY CATEGORY", flush=True)
    print("="*80, flush=True)

    for cat, terms in CATEGORIES.items():
        print(f"\n## {cat}", flush=True)
        for term in terms:
            matches = term_matches.get(term, [])
            if not matches:
                print(f"  '{term}': NO CONCEPTS FOUND", flush=True)
                continue
            for m in matches[:3]:
                cid = m['concept_id']
                er = entity_rules.get(cid)
                status = f"family={er['family_key']}" if er else "MISSING"
                print(f"  '{term}': {cid} ({m['paper_count']} papers) [{status}] mention='{m['sample_mention']}'", flush=True)

    print("\nDone! Full results in /tmp/psych_audit_results.json", flush=True)


if __name__ == '__main__':
    main()
