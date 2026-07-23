# Interview Question Design

## Principle: Every question must stem from a specific signal in the analysis report

No generic questions: "What style of character do you want?"
Yes signal-driven questions: "Analysis shows this project's documentation style is very minimal and engineering-oriented (abstract.code_style score=0.8). Which direction should the character's personality base lean towards?"


## Question Categories (8 Dimensions)

Design 1-2 questions per category (7-14 total):

1. **tone**: The character's overall emotional atmosphere.
   - From signals: README tone, commit message style, abstract.team_culture, abstract.product_philosophy
   - Example options: "Calm and professional, like a librarian" / "Lively and warm, like a community host" / "Cold and minimal, like a terminal interface" / "Mysterious and poetic, like an astrologer"

2. **audience**: Who the character is for and how the user intends to use them.
   - From signals: preAnalysis.project_category, README target-user descriptions
   - Example options: "Brand mascot (needs recognizability and symbolism)" / "Community mascot (daily companion, grounded)" / "Story protagonist (needs complex personality and backstory)" / "Purely decorative (visuals first)"

3. **weight**: The character's weight class — their position in the world, from central figure to ordinary member.
   - From signals: preAnalysis.project_category, abstract.product_philosophy
   - Example options: "High-concept / symbolic tier (guardian/recorder/rebel of the world, with dramatic tension)" / "Everyday tier (ordinary resident of the world, grounded but with distinct personality)" / "Defer to Creative Team"
   - This dimension directly affects the downstream World Architect's world-rule intensity and the Character Designer's character centrality.

4. **world**: User's preference for the complexity of the character's world.
   - From signals: (No direct repo signal for this dimension — entirely user-preference driven)
   - Example options: "Strong-rule world (has clear fundamental laws, like 'every book is a person's memory')" / "Weak-rule / atmosphere-only world (defined by mood and texture, rules don't matter)" / "Defer to Creative Team to infer from repo signals"
   - If the user skips this question, the Creative Team will infer world complexity from the character's weight class.

5. **style**: The character's art direction.
   - From signals: color extraction results, project type (game/tool/library)
   - Example options: "Cyberpunk / futuristic" / "Japanese traditional / wa-style" / "Fantasy / magical girl" / "Everyday / school-life" / "Mecha / sci-fi"

6. **reference**: The user's favorite anime-style characters and what they specifically like about them.
   - From signals: (No direct repo signal for this dimension — entirely user-preference driven)
   - Question phrasing: "Are there any anime-style characters you like? What specifically do you like about them? (e.g., 'I like how Violet Evergarden doesn't understand human emotions but tries hard to learn' — a specific trait, not the entire character)"
   - Mark `optional: true`. The downstream Character Designer will absorb specific traits rather than copy characters.

7. **naming**: How the character name inherits repository identity.
   - From signals: `analysis.context.identity.namingSeeds.primary/secondary`, repo name, package name, product name, README title, domain concepts, user preferences
   - Example options: "Direct anthropomorphization of the repo name" / "Name from core domain concepts" / "Short name + project title" / "User custom"
   - Do NOT default to asking "Chinese/Japanese/Western name." Natural language is not a naming culture direction unless the user raises it.

8. **constraints**: The user's explicit hard requirements.
   - From signals: any preferences the user has already expressed in conversation
   - Example: "Are there any elements you absolutely must avoid?" / "Any specific color palette / symbols / themes that must be included?" / "Any preference for the character's apparent age?"


## Question Design Rules

- Each question must have a `rationale` field stating which analysis signal it comes from
- Each question 2-4 options
- Options must have concrete `description` fields explaining what each choice means
- Questions marked `optional: true` allow the user to skip
- Don't ask what the "Type something." line auto-appended by `ask_user_question` already covers — that's the free-text fallback
