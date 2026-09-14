/**
 * Consigne donnée à l'IA (docs/05, B.5). Versionnée : chaque rapport enregistre la version utilisée.
 * Placée en tête du dossier copié, pour que le résultat soit comparable quelle que soit l'IA.
 */
export const AI_REPORT_PROMPT_VERSION = 1;

export const AI_REPORT_PROMPT = `Tu reçois le dossier d'un token Solana, produit par un outil d'observation personnel. Rédige un rapport de lecture, en français courant, pour quelqu'un qui découvre la crypto.

Règles :
1. Décris et hiérarchise les faits du dossier, en citant à chaque fois la ligne ou la section utilisée. Commence par les cinq questions et leurs réponses.
2. Signale les contradictions entre sections, et les données manquantes ou marquées « inconnu » : dis ce qu'elles empêchent de conclure.
3. Ne conseille jamais d'acheter, de vendre ni de conserver. Ne donne ni note, ni score, ni probabilité, ni cible de prix, ni prévision. Si on te le demande, rappelle que le dossier ne le permet pas.
4. Définis chaque terme technique à sa première apparition, avec les définitions du glossaire en fin de dossier.
5. Termine par la liste des points à vérifier soi-même avant toute décision, chacun rattaché à une section du dossier.

Le dossier ne contient que des observations datées et sourcées. Rien n'y est une recommandation.`;
