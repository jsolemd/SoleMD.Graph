"""Use PubTator3 autocomplete API to discover MESH codes for psychiatric terms,
then cross-reference against our existing audit findings."""

import json, subprocess, time, sys

# Terms to look up via API — focus on ones where we may have wrong/missing MESH codes
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
    # Neurodevelopmental
    "attention deficit hyperactivity disorder", "autism spectrum disorder",
    # Dissociative
    "dissociative identity disorder", "depersonalization disorder",
    "dissociative amnesia",
    # Somatic
    "somatic symptom disorder", "conversion disorder",
    "functional neurological disorder", "illness anxiety disorder",
    # Sleep
    "insomnia disorder", "narcolepsy", "REM sleep behavior disorder",
    "restless legs syndrome", "circadian rhythm sleep disorder",
    # Suicidality
    "suicide", "suicidal ideation", "self harm", "self injurious behavior",
    # Neuropsych phenotypes
    "psychosis", "hallucinations", "auditory hallucinations",
    "visual hallucinations", "delusions", "paranoia",
    "catatonia", "mutism",
    "agitation", "aggression", "irritability",
    "apathy", "abulia", "avolition",
    "impulsivity", "disinhibition",
    "emotional lability", "pseudobulbar affect",
    "executive dysfunction",
    "amnesia", "memory impairment",
    "personality change",
    "dissociation",
    "anhedonia",
    "delirium", "confusion",
    "cognitive impairment", "dementia",
]


def fetch_pubtator_concept(term):
    """Call PubTator3 autocomplete API for a term."""
    import urllib.parse
    encoded = urllib.parse.quote(term)
    url = f"https://www.ncbi.nlm.nih.gov/research/pubtator3-api/entity/autocomplete/?query={encoded}"
    try:
        result = subprocess.run(
            ["curl", "-s", "-m", "10", url],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout)
            return data
    except Exception as e:
        print(f"  ERROR for '{term}': {e}", flush=True)
    return None


def main():
    print(f"Fetching {len(TERMS)} terms from PubTator3 API...", flush=True)

    api_results = {}
    all_concept_ids = set()

    for i, term in enumerate(TERMS):
        data = fetch_pubtator_concept(term)
        if data and isinstance(data, list):
            # Filter for disease-type results with MESH codes
            matches = []
            for item in data[:5]:  # top 5 results
                cid = item.get("id", "")
                name = item.get("name", "")
                etype = item.get("type", "")
                if cid:
                    matches.append({"concept_id": cid, "name": name, "type": etype})
                    all_concept_ids.add(cid)
            api_results[term] = matches
            top = matches[0]["concept_id"] if matches else "NONE"
            print(f"  [{i+1}/{len(TERMS)}] '{term}' -> {top} ({len(matches)} results)", flush=True)
        else:
            api_results[term] = []
            print(f"  [{i+1}/{len(TERMS)}] '{term}' -> no results", flush=True)

        time.sleep(0.5)  # Rate limiting

    # Save results
    output = {
        "api_results": api_results,
        "all_concept_ids": sorted(all_concept_ids),
    }
    with open("/tmp/psych_api_discovery.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nTotal unique concept IDs discovered: {len(all_concept_ids)}", flush=True)
    print("Saved to /tmp/psych_api_discovery.json", flush=True)

    # Print summary of top results per term
    print("\n=== API DISCOVERY RESULTS ===", flush=True)
    for term, matches in api_results.items():
        if matches:
            top = matches[0]
            print(f"  '{term}' -> {top['concept_id']} ({top['name']})", flush=True)
        else:
            print(f"  '{term}' -> NO RESULTS", flush=True)


if __name__ == "__main__":
    main()
