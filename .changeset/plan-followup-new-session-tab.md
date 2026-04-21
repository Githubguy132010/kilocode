---
"@kilocode/cli": patch
---

Fix the "Start new session" button on the plan follow-up prompt not switching the VS Code Agent Manager to the new session when handover generation is slow. The new session now opens immediately with the plan text already visible, and the handover summary from the planning session is appended once it finishes generating.
