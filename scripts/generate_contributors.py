import requests

REPO = "Harshan07-web/Rx-Block"  
url = f"https://api.github.com/repos/{REPO}/contributors"
response = requests.get(url)

contributors = response.json()

with open("CONTRIBUTORS.md", "w", encoding="utf-8") as f:
    f.write("# 👥 Contributors\n\n")

    for c in contributors:
        username = c["login"]
        profile = c["html_url"]
        contributions = c["contributions"]

        f.write(f"- [{username}]({profile}) — {contributions} commits\n")

print("Contributors file updated!")