"""Use PubTator3 autocomplete API to discover MESH codes, then batch-verify
against our PubTator DB and entity_rule."""

import json, subprocess, time, urllib.parse
from app import db

TERMS = [
    # Schizophrenia spectrum
    "schizophrenia", "schizoaffective disorder", "schizophreniform disorder",
    "brief psychotic disorder", "delusional disorder",
    # Bipolar
    "bipolar disorder", "bipolar I disorder", "bipolar II disorder",
    "cyclothymia", "bipolar depression",
    # Depression
    "major depressive disorder", "persistent depressive disorder", "dysthymia",
    "seasonal affective disorder", "postpartum depression",
    "treatment resistant depression",
    # Anxiety
    "generalized anxiety disorder", "panic disorder", "social anxiety disorder",
    "social phobia", "agoraphobia", "specific phobia", "separation anxiety disorder",
    # OCD
    "obsessive compulsive disorder", "body dysmorphic disorder",
    "hoarding disorder", "trichotillomania", "excoriation disorder",
    # Trauma
    "post traumatic stress disorder", "acute stress disorder",
    "complex PTSD", "adjustment disorder",
    # Personality
    "borderline personality disorder", "antisocial personality disorder",
    "narcissistic personality disorder", "avoidant personality disorder",
    "schizotypal personality disorder",
    # Eating
    "anorexia nervosa", "bulimia nervosa", "binge eating disorder",
    # Substance
    "alcohol use disorder", "opioid use disorder", "stimulant use disorder",
    "cannabis use disorder", "cocaine use disorder", "substance withdrawal",
    "alcoholism",
    # Neurodevelopmental
    "attention deficit hyperactivity disorder", "autism spectrum disorder",
    # Dissociative
    "dissociative identity disorder", "depersonalization disorder",
    "dissociative amnesia",
    # Somatic
    "somatic symptom disorder", "conversion disorder",
    "functional neurological disorder", "illness anxiety disorder",
    "hypochondriasis",
    # Sleep
    "insomnia", "narcolepsy", "REM sleep behavior disorder",
    "restless legs syndrome", "circadian rhythm sleep disorder",
    # Suicidality
    "suicide", "suicidal ideation", "self harm", "self injurious behavior",
    # Neuropsych phenotypes
    "psychosis", "hallucinations", "delusions", "paranoia",
    "catatonia", "mutism", "agitation", "aggression", "irritability",
    "apathy", "abulia", "impulsivity", "disinhibition",
    "emotional lability", "pseudobulbar affect",
    "executive dysfunction", "amnesia", "memory impairment",
    "anhedonia", "delirium", "confusion",
    "cognitive impairment", "dementia",
]


def fetch_api(term):
    encoded = urllib.parse.quote(term)
    url = f"https://www.ncbi.nlm.nih.gov/research/pubtator3-api/entity/autocomplete/?query={encoded}"
    try:
        result = subprocess.run(
            ["curl", "-s", "-m", "10", url],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout)
            if isinstance(data, list):
                return data
    except Exception as e:
        print(f"  ERROR: {e}", flush=True)
    return []


def main():
    print(f"Step 1: Fetching {len(TERMS)} terms from PubTator3 API...", flush=True)

    # concept_id -> {name, biotype, found_via_terms}
    discovered = {}
    term_to_top = {}

    for i, term in enumerate(TERMS):
        results = fetch_api(term)
        matches = []
        for item in results[:5]:
            db_id = item.get("db_id", "")
            db_name = item.get("db", "")
            name = item.get("name", "")
            biotype = item.get("biotype", "")
            if db_id and db_name == "ncbi_mesh":
                cid = f"MESH:{db_id}"
                matches.append({"concept_id": cid, "name": name, "biotype": biotype})
                if cid not in discovered:
                    discovered[cid] = {"name": name, "biotype": biotype, "terms": []}
                discovered[cid]["terms"].append(term)

        top = matches[0]["concept_id"] if matches else "NONE"
        top_name = matches[0]["name"] if matches else ""
        term_to_top[term] = (top, top_name)
        print(f"  [{i+1}/{len(TERMS)}] '{term}' -> {top} ({top_name})", flush=True)
        time.sleep(0.4)

    print(f"\nTotal unique MESH codes from API: {len(discovered)}", flush=True)

    # Step 2: Batch check PubTator DB for paper counts
    print("\nStep 2: Checking PubTator paper counts...", flush=True)
    all_cids = list(discovered.keys())

    pubtator_data = {}
    with db.pooled() as conn, conn.cursor() as cur:
        for i in range(0, len(all_cids), 200):
            chunk = all_cids[i:i+200]
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
        print(f"  {len(pubtator_data)}/{len(all_cids)} found in PubTator", flush=True)

        # Step 3: Check entity_rule
        print("\nStep 3: Checking entity_rule...", flush=True)
        entity_rules = {}
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
                    'confidence': str(r['confidence']) if r['confidence'] else None,
                }
        print(f"  {len(entity_rules)}/{len(all_cids)} found in entity_rule", flush=True)

    # Step 4: Compile results
    print("\n" + "="*100, flush=True)
    print("API DISCOVERY RESULTS — sorted by paper count", flush=True)
    print("="*100, flush=True)

    # Merge all info
    rows = []
    for cid, info in discovered.items():
        pt = pubtator_data.get(cid, {})
        er = entity_rules.get(cid, {})
        rows.append({
            'concept_id': cid,
            'api_name': info['name'],
            'biotype': info['biotype'],
            'terms': info['terms'],
            'paper_count': pt.get('paper_count', 0),
            'in_pubtator': cid in pubtator_data,
            'entity_type': pt.get('entity_type', ''),
            'in_entity_rule': cid in entity_rules,
            'family_key': er.get('family_key', ''),
        })

    rows.sort(key=lambda x: -x['paper_count'])

    # Print all
    for r in rows:
        status = f"family={r['family_key']}" if r['in_entity_rule'] else "**MISSING**"
        pt_status = f"{r['paper_count']:,} papers" if r['in_pubtator'] else "NOT IN DB"
        print(f"  {r['concept_id']}: {r['api_name']} | {pt_status} | {status} | via: {r['terms'][0]}", flush=True)

    # Summary of NEW discoveries not in original audit
    print(f"\n{'='*100}", flush=True)
    print("NEW CONCEPTS NOT IN ORIGINAL AUDIT", flush=True)
    print(f"{'='*100}", flush=True)

    # Load original audit known codes
    with open('/tmp/psych_audit_targeted.json') as f:
        original = json.load(f)
    original_cids = set()
    for cat_codes in original['known_codes'].values():
        original_cids.update(cat_codes.keys())

    new_concepts = [r for r in rows if r['concept_id'] not in original_cids and r['in_pubtator']]
    for r in new_concepts:
        status = f"family={r['family_key']}" if r['in_entity_rule'] else "MISSING"
        print(f"  {r['concept_id']}: {r['api_name']} | {r['paper_count']:,} papers | {status}", flush=True)

    # Save
    output = {
        'term_to_top': {k: {'concept_id': v[0], 'name': v[1]} for k, v in term_to_top.items()},
        'discovered': {cid: info for cid, info in discovered.items()},
        'pubtator_data': pubtator_data,
        'entity_rules': entity_rules,
        'new_concepts': [r for r in new_concepts],
    }
    with open('/tmp/psych_api_discovery_v2.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n{len(new_concepts)} new concepts discovered via API that weren't in original audit", flush=True)


if __name__ == '__main__':
    main()
