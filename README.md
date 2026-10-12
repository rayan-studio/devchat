# DevChat

Le chat d'équipe pour développeurs : canaux en temps réel, blocs de code lisibles, et bientôt un fil ouvert automatiquement pour chaque pull request et chaque issue GitHub.

Cette version correspond à l'**étape 1 (Fondations)** du plan : comptes, équipes, invitations par lien, canaux et messages en temps réel.

## Ce qui marche aujourd'hui

- Connexion avec GitHub, plus une connexion de test sans GitHub pour développer en local
- Équipes, avec `#general` et `#random` créés d'office
- Invitation par lien, que le propriétaire peut régénérer
- Canaux publics
- Messages en temps réel : envoi, modification, suppression, historique paginé
- Blocs de code ```` ``` ```` avec bouton Copier, `code en ligne`, **gras**, liens et @mentions
- Présence en ligne, indicateur « écrit… », pastilles de non-lus
- Reconnexion automatique avec rattrapage des messages manqués
- Interface responsive (tiroir de navigation sur mobile)

## Structure

```
devchat/
├── apps/
│   ├── server/   API Express + Socket.io + Prisma (PostgreSQL)
│   └── web/      Interface Next.js + Tailwind CSS
└── docker-compose.yml   PostgreSQL pour le développement
```

## Lancer le projet en local

Prérequis : Node.js 20 ou plus récent, et Docker (ou un PostgreSQL déjà installé).

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer PostgreSQL
docker compose up -d

# 3. Configurer les variables d'environnement
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
# puis mets une vraie valeur dans JWT_SECRET (par exemple : openssl rand -hex 32)

# 4. Créer les tables
npm run db:migrate -- --name init

# 5. Démarrer le serveur et l'interface
npm run dev
```

Ouvre ensuite http://localhost:3000. Avec `DEV_LOGIN=true`, tu peux entrer avec n'importe quel pseudo. Pour tester à plusieurs, ouvre une fenêtre de navigation privée et entre avec un autre pseudo.

## Activer la connexion GitHub

1. Va sur https://github.com/settings/developers, puis **New OAuth App**.
2. Homepage URL : `http://localhost:3000`
3. Authorization callback URL : `http://localhost:4000/auth/github/callback`
4. Copie le Client ID et génère un Client Secret, puis colle-les dans `apps/server/.env` (`GITHUB_CLIENT_ID` et `GITHUB_CLIENT_SECRET`).
5. Redémarre le serveur : le bouton « Se connecter avec GitHub » apparaît.

## Mise en production

- **Interface** (`apps/web`) : Vercel. Variable `NEXT_PUBLIC_API_URL` = l'adresse publique du serveur.
- **Serveur** (`apps/server`) : Railway, Render ou Fly.io, qui gardent les connexions WebSocket ouvertes (Vercel ne le fait pas). Commande de build `npm run build`, puis `npm run db:deploy && npm start`.
- **Base** : le PostgreSQL de Railway, Neon ou Supabase.
- En production : `DEV_LOGIN=false`, un `JWT_SECRET` long et aléatoire, et une OAuth App GitHub avec les vraies adresses.

## Limites connues de cette version

- Un seul serveur à la fois : la présence en ligne et l'anti-spam sont gardés en mémoire. Au-delà d'une instance, il faudra Redis et l'adaptateur Redis de Socket.io.
- Le jeton de session est stocké dans le navigateur (`localStorage`). C'est simple et ça marche entre deux domaines différents, mais un cookie `HttpOnly` sur un domaine commun sera plus sûr quand l'appli aura un nom de domaine.
- Pas encore de canaux privés, de messages privés, de fichiers ni de recherche : ce sont les étapes suivantes.

## Prochaine étape

Étape 2 du plan : l'intégration GitHub (une GitHub App qui reçoit les webhooks et ouvre un fil par PR et par issue), puis l'envoi de fichiers et les notifications.
