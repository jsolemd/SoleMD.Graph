"""Audit PubTator concepts for primary psychiatric disorders and neuropsych phenotypes."""

import json
from app import db

CATEGORIES = {
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
    # --- NEUROPSYCHIATRIC PHENOTYPES ---
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
    all_results = {}
    all_concept_ids = set()

    with db.pooled() as conn, conn.cursor() as cur:
        # Step 1: Search all terms
        for category, terms in CATEGORIES.items():
            cat_results = {}
            for term in terms:
                cur.execute("""
                    SELECT ea.concept_id, ea.entity_type,
                        MIN(ea.mentions) as sample_mention,
                        COUNT(DISTINCT ea.pmid)::integer as paper_count
                    FROM pubtator.entity_annotations ea
                    WHERE lower(ea.mentions) LIKE %s
                    GROUP BY ea.concept_id, ea.entity_type
                    ORDER BY paper_count DESC
                    LIMIT 5
                """, (f'%{term}%',))
                rows = cur.fetchall()
                cat_results[term] = []
                for r in rows:
                    cat_results[term].append({
                        'concept_id': r['concept_id'],
                        'entity_type': r['entity_type'],
                        'sample_mention': r['sample_mention'],
                        'paper_count': r['paper_count'],
                    })
                    all_concept_ids.add(r['concept_id'])
                print(f"  searched: {term} -> {len(rows)} concepts")
            all_results[category] = cat_results
            print(f"Done: {category}")

        # Step 2: Check which are in entity_rule
        entity_rules = {}
        if all_concept_ids:
            cur.execute("""
                SELECT concept_id, family_key, confidence
                FROM solemd.entity_rule
                WHERE concept_id = ANY(%s)
            """, (list(all_concept_ids),))
            for r in cur.fetchall():
                entity_rules[r['concept_id']] = {
                    'family_key': r['family_key'],
                    'confidence': float(r['confidence']) if r['confidence'] else None,
                }

    # Step 3: Write results as JSON for processing
    output = {
        'results': all_results,
        'entity_rules': entity_rules,
    }
    with open('/tmp/psych_audit_results.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\nTotal unique concepts found: {len(all_concept_ids)}")
    print(f"Concepts in entity_rule: {len(entity_rules)}")
    print(f"Concepts MISSING from entity_rule: {len(all_concept_ids - set(entity_rules.keys()))}")
    print("Results written to /tmp/psych_audit_results.json")


if __name__ == '__main__':
    main()
