import re

queries_file = "engine/app/rag/queries.py"

with open(queries_file, "r") as f:
    content = f.read()

# Let's inspect where _paper_search_sql is defined
match = re.search(r"def _paper_search_sql.*?:(.*?)return", content, re.DOTALL)
if match:
    # Let's check how WHERE clause is formed
    where_match = re.search(r"WHERE.*", match.group(1), re.DOTALL)
    if where_match:
        print("Found WHERE in _paper_search_sql")
