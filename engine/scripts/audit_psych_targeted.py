"""Targeted audit: look up known MESH codes for psychiatric conditions,
verify they exist in PubTator, check entity_rule status, and also
discover additional codes by doing focused mention searches."""

import json, time
from app import db

# Known MESH codes for psychiatric conditions and neuropsych phenotypes
# Sources: MeSH Browser (nlm.nih.gov/mesh)
KNOWN_CODES = {
    # === SCHIZOPHRENIA SPECTRUM ===
    "Schizophrenia Spectrum": {
        "MESH:D012559": "Schizophrenia",
        "MESH:D011618": "Psychotic Disorders",
        "MESH:D063045": "Schizophrenia Spectrum and Other Psychotic Disorders",  # DSM-5 code
        "MESH:D019967": "Schizophrenia, Catatonic",  # subtype
        "MESH:D012563": "Schizophrenia, Paranoid",
        "MESH:D012569": "Shared Paranoid Disorder / Folie à Deux",
        "MESH:D054062": "Schizotypal Personality Disorder",
        "MESH:D063326": "Schizoaffective Disorder (if exists)",
    },
    # === BIPOLAR SPECTRUM ===
    "Bipolar Spectrum": {
        "MESH:D001714": "Bipolar Disorder",
        "MESH:D003527": "Cyclothymic Disorder",
        "MESH:C535338": "Cyclothymic personality",
    },
    # === DEPRESSIVE DISORDERS ===
    "Depressive Disorders": {
        "MESH:D003866": "Depressive Disorder, Major",
        "MESH:D003865": "Depressive Disorder",
        "MESH:D019263": "Dysthymic Disorder",
        "MESH:D061218": "Depressive Disorder, Treatment-Resistant",
        "MESH:D016574": "Seasonal Affective Disorder",
        "MESH:D019052": "Depression, Postpartum",
    },
    # === ANXIETY DISORDERS ===
    "Anxiety Disorders": {
        "MESH:D001008": "Anxiety Disorders",
        "MESH:D001007": "Anxiety",
        "MESH:D016584": "Panic Disorder",
        "MESH:D010698": "Phobic Disorders",
        "MESH:D000379": "Agoraphobia",  # older code
        "MESH:D001010": "Separation Anxiety Disorder",
        "MESH:D012585": "Social Phobia / Social Anxiety",  # if exists
    },
    # === OCD SPECTRUM ===
    "OCD Spectrum": {
        "MESH:D009771": "Obsessive-Compulsive Disorder",
        "MESH:D057215": "Body Dysmorphic Disorder",
        "MESH:D006816": "Hoarding Disorder",  # often Huntington's
        "MESH:D014256": "Trichotillomania",
        "MESH:D057846": "Excoriation Disorder",  # if exists
    },
    # === TRAUMA / STRESS ===
    "Trauma and Stress": {
        "MESH:D013313": "Stress Disorders, Post-Traumatic",
        "MESH:D040701": "Stress Disorders, Traumatic, Acute",
        "MESH:D000275": "Adjustment Disorders",
    },
    # === PERSONALITY DISORDERS ===
    "Personality Disorders": {
        "MESH:D010554": "Personality Disorders",
        "MESH:D001883": "Borderline Personality Disorder",
        "MESH:D000987": "Antisocial Personality Disorder",
        "MESH:D003193": "Compulsive Personality Disorder",
        "MESH:D054062": "Schizotypal Personality Disorder",
        "MESH:D065505": "Narcissistic Personality Disorder (if exists)",
    },
    # === EATING DISORDERS ===
    "Eating Disorders": {
        "MESH:D001068": "Feeding and Eating Disorders",
        "MESH:D000855": "Anorexia Nervosa",
        "MESH:D000856": "Bulimia Nervosa",
        "MESH:D056912": "Binge-Eating Disorder",
        "MESH:D002032": "Bulimia",
    },
    # === SUBSTANCE USE ===
    "Substance Use Disorders": {
        "MESH:D019966": "Substance-Related Disorders",
        "MESH:D000437": "Alcoholism",
        "MESH:D000438": "Alcohol Drinking",
        "MESH:D019970": "Cocaine-Related Disorders",
        "MESH:D009293": "Opioid-Related Disorders",
        "MESH:D002189": "Cannabis Use Disorder (if exists)",
        "MESH:D001039": "Cocaine use/dependence (if exists)",
        "MESH:D013375": "Substance Withdrawal Syndrome",
    },
    # === NEURODEVELOPMENTAL ===
    "Neurodevelopmental": {
        "MESH:D001289": "Attention Deficit Disorder with Hyperactivity",
        "MESH:D000067877": "Autism Spectrum Disorder",
        "MESH:D001321": "Autistic Disorder",
        "MESH:D065886": "Neurodevelopmental Disorders",
    },
    # === DISSOCIATIVE ===
    "Dissociative Disorders": {
        "MESH:D004213": "Dissociative Disorders",
        "MESH:D009105": "Multiple Personality Disorder",
        "MESH:D003861": "Depersonalization",
        "MESH:D000647": "Amnesia (dissociative/retrograde)",
    },
    # === SOMATIC / FUNCTIONAL ===
    "Somatic/Functional": {
        "MESH:D013001": "Somatoform Disorders",
        "MESH:D003291": "Conversion Disorder",
        "MESH:D006998": "Hypochondriasis",
        "MESH:D000071896": "Somatic Symptom Disorder (if exists)",
        "MESH:D000071180": "Functional Neurological Disorder (if exists)",
    },
    # === SLEEP ===
    "Sleep Disorders": {
        "MESH:D012893": "Sleep Wake Disorders",
        "MESH:D007319": "Sleep Initiation and Maintenance Disorders (Insomnia)",
        "MESH:D009290": "Narcolepsy",
        "MESH:D020187": "REM Sleep Behavior Disorder",
        "MESH:D012148": "Restless Legs Syndrome",
        "MESH:D021081": "Circadian Rhythm Sleep Disorders (if exists)",
    },
    # === SUICIDALITY ===
    "Suicidality": {
        "MESH:D013405": "Suicide",
        "MESH:D059020": "Suicidal Ideation",
        "MESH:D016728": "Self-Injurious Behavior",
        "MESH:D000091029": "Suicide, Attempted",
    },
    # === NEUROPSYCH PHENOTYPES ===
    "Psychosis Phenotypes": {
        "MESH:D011605": "Psychoses, Substance-Induced",
        "MESH:D006212": "Hallucinations",
        "MESH:D003702": "Delusions",
        "MESH:D010259": "Paranoid Disorders",
    },
    "Catatonia": {
        "MESH:D002389": "Catatonia",
        "MESH:D009155": "Mutism",
        "MESH:D053444": "Stupor (if exists)",
    },
    "Agitation/Aggression": {
        "MESH:D011595": "Psychomotor Agitation",
        "MESH:D000374": "Aggression",
        "MESH:D007508": "Irritable Mood (if exists)",
    },
    "Apathy/Motivation": {
        "MESH:D000071085": "Apathy",
    },
    "Impulsivity": {
        "MESH:D007175": "Impulsive Behavior",
        "MESH:D007174": "Disruptive, Impulse Control",
    },
    "Emotional Dysregulation": {
        "MESH:D059445": "Anhedonia",
        "MESH:D019964": "Mood Disorders",
        "MESH:D020828": "Pseudobulbar Palsy",
        "MESH:D003410": "Crying (pathological)",
        "MESH:D000080207": "Emotional Lability (if exists)",
    },
    "Executive/Frontal": {
        "MESH:D003072": "Cognition Disorders",
        "MESH:D056344": "Executive Function",
        "MESH:D019636": "Neurodegenerative Diseases",
    },
    "Memory/Amnesia": {
        "MESH:D000647": "Amnesia",
        "MESH:D000648": "Amnesia, Retrograde",
        "MESH:D008569": "Memory Disorders",
    },
    "Cognitive": {
        "MESH:D060825": "Cognitive Dysfunction",
        "MESH:D003704": "Dementia",
        "MESH:D000544": "Alzheimer Disease",
    },
    "Delirium": {
        "MESH:D003693": "Delirium",
        "MESH:D003221": "Confusion",
    },
}


def main():
    # Flatten all concept_ids to check
    all_codes = {}  # concept_id -> (category, label)
    for cat, codes in KNOWN_CODES.items():
        for cid, label in codes.items():
            all_codes[cid] = (cat, label)

    print(f"Checking {len(all_codes)} known MESH codes across {len(KNOWN_CODES)} categories", flush=True)

    with db.pooled() as conn, conn.cursor() as cur:
        # Step 1: Check which codes exist in PubTator with paper counts
        print("\nStep 1: Checking PubTator presence...", flush=True)
        start = time.time()
        code_list = list(all_codes.keys())
        pubtator_data = {}
        for i in range(0, len(code_list), 200):
            chunk = code_list[i:i+200]
            cur.execute("""
                SELECT concept_id, entity_type,
                    COUNT(DISTINCT pmid)::integer as paper_count,
                    MIN(mentions) as sample_mention
                FROM pubtator.entity_annotations
                WHERE concept_id = ANY(%s)
                GROUP BY concept_id, entity_type
            """, (chunk,))
            for r in cur.fetchall():
                pubtator_data[r['concept_id']] = {
                    'entity_type': r['entity_type'],
                    'paper_count': r['paper_count'],
                    'sample_mention': r['sample_mention'],
                }
        print(f"  Found {len(pubtator_data)}/{len(all_codes)} codes in PubTator ({time.time()-start:.0f}s)", flush=True)

        # Step 2: Check entity_rule status
        print("\nStep 2: Checking entity_rule...", flush=True)
        entity_rules = {}
        for i in range(0, len(code_list), 500):
            chunk = code_list[i:i+500]
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
        print(f"  Found {len(entity_rules)}/{len(all_codes)} codes in entity_rule", flush=True)

        # Step 3: Discovery - find additional MESH codes we might have missed
        # Search for specific psychiatric terms in mentions to find codes not in our list
        print("\nStep 3: Discovery search for additional codes...", flush=True)
        discovery_terms = [
            'schizophrenia', 'schizoaffective', 'bipolar', 'depressive disorder',
            'anxiety disorder', 'obsessive-compulsive', 'post-traumatic stress',
            'borderline personality', 'anorexia nervosa', 'bulimia',
            'alcohol use disorder', 'opioid', 'attention deficit', 'autism',
            'dissociative', 'insomnia', 'narcolepsy', 'suicide', 'delirium',
            'psychosis', 'hallucination', 'catatonia', 'apathy', 'anhedonia',
            'binge eating', 'panic disorder', 'agoraphobia', 'ptsd',
        ]

        discovered = {}
        for term in discovery_terms:
            # Use a more targeted search: concept_id must be MESH disease, mention must match closely
            cur.execute("""
                SELECT ea.concept_id,
                    COUNT(DISTINCT ea.pmid)::integer as paper_count,
                    MIN(ea.mentions) as sample_mention
                FROM pubtator.entity_annotations ea
                WHERE ea.entity_type = 'disease'
                  AND ea.concept_id LIKE 'MESH:%%'
                  AND lower(ea.mentions) = %s
                GROUP BY ea.concept_id
                ORDER BY paper_count DESC
                LIMIT 5
            """, (term,))
            rows = cur.fetchall()
            for r in rows:
                cid = r['concept_id']
                if cid not in all_codes and cid not in discovered:
                    discovered[cid] = {
                        'paper_count': r['paper_count'],
                        'sample_mention': r['sample_mention'],
                        'found_via': term,
                    }
            if rows:
                print(f"  '{term}': {[r['concept_id'] for r in rows[:3]]}", flush=True)
            else:
                print(f"  '{term}': no exact matches", flush=True)

        # Check entity_rule for discovered codes
        if discovered:
            disc_codes = list(discovered.keys())
            cur.execute("""
                SELECT concept_id, family_key, confidence
                FROM solemd.entity_rule
                WHERE concept_id = ANY(%s)
            """, (disc_codes,))
            for r in cur.fetchall():
                discovered[r['concept_id']]['family_key'] = r['family_key']
                discovered[r['concept_id']]['confidence'] = str(r['confidence']) if r['confidence'] else None

    # === Generate report ===
    print("\n" + "="*100, flush=True)
    print("COMPREHENSIVE AUDIT REPORT", flush=True)
    print("="*100, flush=True)

    missing_from_er = []
    wrong_family = []
    in_pubtator_in_er = []
    not_in_pubtator = []

    for cat, codes in KNOWN_CODES.items():
        print(f"\n### {cat}", flush=True)
        for cid, label in codes.items():
            pt = pubtator_data.get(cid)
            er = entity_rules.get(cid)

            if pt:
                papers = pt['paper_count']
                mention = pt['sample_mention'][:60] if pt['sample_mention'] else 'N/A'
                if er:
                    status = f"IN_RULE family={er['family_key']} conf={er['confidence']}"
                    in_pubtator_in_er.append((cid, label, cat, er['family_key'], papers))
                else:
                    status = "**MISSING FROM ENTITY_RULE**"
                    missing_from_er.append((cid, label, cat, papers))
                print(f"  {cid}: {label} | {papers:,} papers | {status} | mention='{mention}'", flush=True)
            else:
                not_in_pubtator.append((cid, label, cat))
                print(f"  {cid}: {label} | NOT IN PUBTATOR", flush=True)

    if discovered:
        print(f"\n### DISCOVERED (not in initial list)", flush=True)
        for cid, data in sorted(discovered.items(), key=lambda x: -x[1]['paper_count']):
            er_info = f"family={data.get('family_key', 'MISSING')}" if 'family_key' in data else "MISSING FROM ENTITY_RULE"
            print(f"  {cid}: found via '{data['found_via']}' | {data['paper_count']:,} papers | {er_info}", flush=True)

    # Summary
    print(f"\n{'='*100}", flush=True)
    print("SUMMARY", flush=True)
    print(f"{'='*100}", flush=True)
    print(f"Total known codes checked: {len(all_codes)}", flush=True)
    print(f"Found in PubTator: {len(pubtator_data)}", flush=True)
    print(f"In entity_rule: {len(entity_rules)}", flush=True)
    print(f"MISSING from entity_rule: {len(missing_from_er)}", flush=True)
    print(f"Not in PubTator at all: {len(not_in_pubtator)}", flush=True)
    print(f"Discovered additional codes: {len(discovered)}", flush=True)

    print(f"\n--- HIGH-PRIORITY GAPS (in PubTator, not in entity_rule) ---", flush=True)
    for cid, label, cat, papers in sorted(missing_from_er, key=lambda x: -x[3]):
        print(f"  {cid}: {label} [{cat}] ({papers:,} papers)", flush=True)

    # Save full results for report generation
    output = {
        'pubtator_data': pubtator_data,
        'entity_rules': entity_rules,
        'known_codes': {cat: codes for cat, codes in KNOWN_CODES.items()},
        'discovered': discovered,
        'missing_from_er': [(c, l, cat, p) for c, l, cat, p in missing_from_er],
        'not_in_pubtator': [(c, l, cat) for c, l, cat in not_in_pubtator],
        'in_rule': [(c, l, cat, f, p) for c, l, cat, f, p in in_pubtator_in_er],
    }
    with open('/tmp/psych_audit_targeted.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\nFull results saved to /tmp/psych_audit_targeted.json", flush=True)


if __name__ == '__main__':
    main()
