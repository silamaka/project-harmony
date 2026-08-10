# Project Harmony

# Prompt Lovable

Agis comme un développeur Full Stack Senior expert en React, TypeScript, Tailwind CSS, Django REST Framework et PostgreSQL.

Je souhaite développer une plateforme web professionnelle de gestion d'agence de marketing et communication digitale. L'application doit être moderne, rapide, responsive, sécurisée, évolutive et respecter les bonnes pratiques de développement.

## Stack technique

Frontend :

* React
* TypeScript
* Vite
* Tailwind CSS
* React Router
* React Query (TanStack Query)
* Axios
* React Hook Form
* Zod
* Framer Motion
* Recharts
* Lucide React

Backend :

* Django
* Django REST Framework
* JWT Authentication
* PostgreSQL
* Cloudinary (ou Amazon S3) pour le stockage des fichiers

L'architecture doit être modulaire et facilement maintenable.

---

# Authentification

Créer un système d'authentification sécurisé avec JWT.

Pages :

* Connexion
* Mot de passe oublié
* Réinitialisation du mot de passe

Après connexion, rediriger automatiquement l'utilisateur selon son rôle :

* Administrateur → Dashboard Administrateur
* Chef de Projet → Dashboard Chef de Projet
* Collaborateur → Dashboard Collaborateur
* Client → Portail Client

---

# Gestion des rôles

Créer quatre rôles :

## Administrateur

Peut :

* gérer tous les utilisateurs
* gérer tous les clients
* gérer tous les projets
* gérer toutes les missions
* gérer tous les livrables
* voir toutes les statistiques
* gérer les paramètres

## Chef de projet

Peut :

* créer un client
* créer un projet
* créer une mission
* affecter les collaborateurs
* modifier les missions
* valider les livrables
* répondre aux commentaires

## Collaborateur

Peut :

* consulter uniquement ses missions
* modifier le statut de ses missions
* déposer des livrables
* commenter
* consulter son planning

## Client

Peut :

* consulter uniquement ses projets
* consulter ses livrables
* commenter
* demander des corrections
* valider un livrable

---

# Dashboard

Créer un tableau de bord moderne avec :

KPIs

* Nombre de clients
* Nombre de projets
* Nombre de missions
* Nombre de collaborateurs
* Nombre de livrables
* Nombre de missions en retard

Graphiques

* missions par client
* missions par collaborateur
* évolution mensuelle
* taux de réalisation

Alertes

* échéance dans 24 heures
* échéance dans 48 heures
* missions bloquées
* livrables en attente

---

# Module Clients

Créer un CRUD complet.

Chaque client possède :

* informations générales
* contacts
* projets
* missions
* livrables
* historique

Actions :

* créer
* modifier
* supprimer
* rechercher
* filtrer

---

# Module Collaborateurs

CRUD complet.

Chaque collaborateur possède :

* photo
* nom
* prénom
* rôle
* téléphone
* email
* charge de travail
* liste des missions

---

# Module Projets

Chaque projet possède :

* nom
* client
* description
* date de début
* date de fin
* statut
* progression
* responsable

Statuts :

* Brouillon
* En préparation
* En cours
* En attente
* Terminé
* Archivé

---

# Module Missions

Chaque mission contient :

* titre
* description
* objectif
* stratégie
* ressources
* priorité
* responsable
* deadline
* statut

Priorités :

* Faible
* Normale
* Haute
* Urgente
* Critique

Workflow :

À faire

↓

En cours

↓

Livrable déposé

↓

Validation interne

↓

Envoyé au client

↓

Validé

ou

Corrections demandées

↓

Terminé

---

# Livrables

Autoriser :

* PDF
* Images
* ZIP
* Vidéos
* Liens

Fonctionnalités :

* upload
* téléchargement
* prévisualisation
* historique
* versionnage

---

# Commentaires

Chaque mission possède une discussion.

Fonctionnalités :

* répondre
* joindre un fichier
* @mention
* historique

---

# Calendrier

Créer un calendrier avec :

* Jour
* Semaine
* Mois
* Agenda

Fonctionnalités :

* Drag & Drop
* filtres
* recherche

---

# Notifications

Créer un système de notifications en temps réel.

Déclencheurs :

* mission créée
* mission assignée
* commentaire
* livrable déposé
* validation
* correction demandée
* retard

Prévoir :

* notification interne
* email

---

# Portail Client

Créer un espace client contenant :

* Dashboard
* Mes projets
* Mes livrables
* Validation
* Téléchargements
* Historique
* Commentaires

---

# Paramètres

Créer un module permettant de gérer :

* entreprise
* logo
* utilisateurs
* permissions
* emails
* sauvegardes

---

# API REST

Prévoir les endpoints suivants :

/api/v1/auth/
/api/v1/users/
/api/v1/clients/
/api/v1/projects/
/api/v1/tasks/
/api/v1/comments/
/api/v1/files/
/api/v1/dashboard/
/api/v1/calendar/
/api/v1/notifications/
/api/v1/statistics/

---

# Interface utilisateur

Créer une interface premium inspirée de Notion, Linear, ClickUp et Monday.com.

Le design doit être :

* moderne
* minimaliste
* professionnel
* responsive
* fluide
* élégant

Utiliser :

* cartes modernes
* tableaux interactifs
* tableaux Kanban
* graphiques
* animations discrètes
* mode clair et sombre
* icônes Lucide
* couleurs cohérentes
* composants réutilisables

---

# Architecture React

Organiser le projet avec une architecture modulaire utilisant des composants réutilisables, des layouts, des pages, des hooks, des services, des contextes, des routes, des utilitaires, des types et une séparation claire des fonctionnalités.

---

# Qualité du code

Le code généré doit être :

* propre
* fortement typé avec TypeScript
* modulaire
* documenté
* réutilisable
* évolutif
* performant
* sécurisé

Respecter les bonnes pratiques React et Django REST Framework.

Commencer par générer la structure complète de l'application, puis développer progressivement chaque module avec des composants fonctionnels, des interfaces modernes et un code prêt à être connecté à l'API Django.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2327d852-94d7-43ae-b306-e6318bddc98c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
