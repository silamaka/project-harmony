# OLYMPE

Plateforme web de gestion d'agence de marketing et communication digitale
(BEBA EMPIRE) : clients, projets, missions, livrables, calendrier,
notifications, portail client. Frontend React/TypeScript (voir
`src/services/index.ts` et `src/lib/api.ts`) branché sur un backend Django
REST Framework réel (voir `backend/`), authentification par JWT.

## Stack technique

Frontend :

- React
- TypeScript
- Vite
- Tailwind CSS
- TanStack Router / TanStack Start
- TanStack Query
- Axios
- React Hook Form
- Zod
- Framer Motion
- Recharts
- Lucide React

Backend (`backend/`) :

- Django
- Django REST Framework
- JWT Authentication (djangorestframework-simplejwt)
- PostgreSQL

## Cahier des charges

### Authentification

Système d'authentification sécurisé avec JWT.

Pages : Connexion, Mot de passe oublié, Réinitialisation du mot de passe.

Après connexion, redirection automatique selon le rôle :

- Administrateur → Dashboard Administrateur
- Chef de Projet → Dashboard Chef de Projet
- Collaborateur → Dashboard Collaborateur
- Client → Portail Client

### Gestion des rôles

**Administrateur** — gère tous les utilisateurs, clients, projets, missions,
livrables ; voit toutes les statistiques ; gère les paramètres.

**Chef de projet** — crée un client, un projet, une mission ; affecte les
collaborateurs ; modifie les missions ; valide les livrables ; répond aux
commentaires.

**Collaborateur** — consulte uniquement ses missions ; modifie leur statut ;
dépose des livrables ; commente ; consulte son planning.

**Client** — consulte toutes ses missions et les livrables que l'agence lui a
envoyés ; commente ; valide chaque livrable ou demande des corrections (il ne
change jamais le statut d'une mission lui-même).

### Dashboard

KPIs : nombre de clients, projets, missions, collaborateurs, livrables,
missions en retard.

Graphiques : missions par client, missions par collaborateur, évolution
mensuelle, taux de réalisation.

Alertes : échéance dans 24 h, échéance dans 48 h, missions bloquées,
livrables en attente.

### Module Clients

CRUD complet. Chaque client possède : informations générales, contacts,
projets, missions, livrables, historique.

### Module Collaborateurs

CRUD complet. Chaque collaborateur possède : photo, nom, prénom, rôle,
téléphone, email, charge de travail, liste des missions.

### Module Projets

Chaque projet possède : nom, client, description, date de début, date de
fin, statut, progression, responsable.

Statuts : Brouillon, En préparation, En cours, En attente, Terminé, Archivé.

### Module Missions

Chaque mission contient : titre, description, priorité, responsable,
deadline, statut.

Priorités : Faible, Normale, Haute, Urgente.

Workflow : À faire → En cours → Livrable déposé → Validation interne →
Envoyé au client → (Validé ou Corrections demandées) → Publié → Terminé.
À partir de l'envoi, le statut suit les livrables (voir ci-dessous).

### Livrables

Types : PDF, Images, ZIP, Vidéos, Liens.

Fonctionnalités : dépôt, ouverture, historique, versionnage, validation /
demande de corrections.

Double validation : l'agence (admin / chef de projet) valide d'abord le
livrable, ce qui l'envoie au client et le notifie ; le client ne voit rien
avant. Le client valide ensuite ou demande des corrections (avec une
explication postée dans la discussion). Prêt à publier = validé des deux
côtés. Un nouveau lien remet les deux validations à zéro. La mission suit :
Corrections si un livrable envoyé est refusé, Envoyé au client tant qu'un
livrable attend le client, Validé quand tout est validé.

### Commentaires

Chaque mission possède une discussion : réponses, @mention, historique.

### Calendrier

Vues Jour / Semaine / Mois / Agenda. Drag & drop, filtres, recherche.

### Notifications

Déclencheurs : mission créée, mission assignée, commentaire, livrable
déposé, validation, correction demandée, retard.

### Portail Client

Dashboard, mes projets, mes livrables, validation, historique, commentaires.

### Paramètres

Gestion des utilisateurs et des rôles.

### API REST

```
/api/v1/auth/
/api/v1/users/
/api/v1/clients/
/api/v1/projects/
/api/v1/missions/
/api/v1/comments/
/api/v1/deliverables/
/api/v1/dashboard/
/api/v1/calendar/
/api/v1/meetings/
/api/v1/notifications/
```

### Interface utilisateur

Design inspiré de Notion, Linear, ClickUp et Monday.com : moderne,
minimaliste, professionnel, responsive, fluide. Cartes, tableaux
interactifs, graphiques, animations discrètes, mode clair/sombre, icônes
Lucide, composants réutilisables.

## Développement

```sh
npm install
npm run dev              # http://localhost:8080
npm run build
npm run lint
npm run test:e2e
```

Copier `.env.example` vers `.env` pour pointer vers le backend
(`VITE_API_URL`). Le backend (`backend/`) doit tourner pour que l'app
fonctionne — voir `backend/README.md` pour le lancer (venv, migrations,
PostgreSQL).

### Tests de bout en bout (Playwright)

Ils tournent contre le vrai backend local (API sur `localhost:8000`), qui
doit être lancé. Une fois, créer les comptes de test (développement
uniquement, la commande refuse de tourner si `DEBUG` est désactivé) :

```sh
cd backend && python manage.py seed_e2e_accounts
npm run test:e2e
```

Chaque test crée ses données par l'API (entreprise, compte client, projet,
mission) et les supprime à la fin. `e2e/deliverables-flow.spec.ts` couvre
le circuit complet d'un livrable entre l'agence et le client.
