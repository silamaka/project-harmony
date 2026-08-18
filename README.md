# Project Harmony

Plateforme web de gestion d'agence de marketing et communication digitale
(BEBA EMPIRE) : clients, projets, missions, livrables, calendrier,
notifications, portail client. Frontend React/TypeScript actuellement
alimenté par des données mock (voir `src/lib/mock-data.ts`) en attendant le
branchement à un backend Django REST Framework (voir `src/services/index.ts`
et `src/lib/api.ts` pour le contrat d'API prévu).

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

Backend (prévu, non branché) :

- Django
- Django REST Framework
- JWT Authentication
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

**Client** — consulte uniquement ses projets et livrables ; commente ;
demande des corrections ; valide un livrable.

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

Chaque mission contient : titre, description, objectif, stratégie,
ressources, priorité, responsable, deadline, statut.

Priorités : Faible, Normale, Haute, Urgente.

Workflow : À faire → En cours → Livrable déposé → Validation interne →
Envoyé au client → (Validé ou Corrections demandées) → Publié → Terminé.

### Livrables

Types : PDF, Images, ZIP, Vidéos, Liens.

Fonctionnalités : dépôt, ouverture, historique, versionnage, validation /
demande de corrections.

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

### API REST prévue

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
/api/v1/statistics/
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

Copier `.env.example` vers `.env` pour pointer vers un backend local
(`VITE_API_URL`) ; sans backend, l'app tourne sur les données mock.
