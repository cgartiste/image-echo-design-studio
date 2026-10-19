# Cortex — module Campagnes avancé

## Objectif
Transformer le module actuel en espace complet de préparation, validation et suivi des campagnes, en reprenant l’organisation des cinq captures sans copier leur ancien habillage.

Les campagnes, listes, statistiques globales, imports HTML et contrôles DNS existent déjà. Les envois et tests sont actuellement simulés : aucun serveur d’envoi n’est connecté.

## 1. Gestion et sécurité des campagnes
- Ajouter les 14 statuts demandés, leurs icônes, couleurs, actions autorisées et historique daté avec l’auteur.
- Interdire la modification du contenu en cours d’envoi et des campagnes terminées ; masquer les archives par défaut.
- Étendre la table : identifiant, créateur, dates, destinataires, mesures, revenus, offre et serveurs. Ajouter filtres utilisateur/période/jour, tri, aperçu, duplication et export.
- Un clone repart en brouillon avec un nouveau nom, sans statistiques, logs, file d’attente ni messages déjà envoyés.
- Appliquer les permissions côté serveur et réserver les opérations dangereuses aux administrateurs.

## 2. Éditeur inspiré des captures
- Organiser l’éditeur en trois zones : offre et destinataires, structure et contenu du message, délivrabilité et programmation.
- Informations générales, description, propriétaire, type, mode test/production, début/fin et fuseau horaire.
- Expéditeur, bounce, domaines d’envoi/tracking, en-têtes, encodage et versions HTML/texte.
- Sélection de plusieurs listes et exclusions ; calcul détaillé des doublons et destinataires réellement autorisés.
- Sélection des offres déjà importées depuis les sponsors ; ne remplir automatiquement que les informations réellement fournies par leurs API.
- Édition et import HTML, recherche/remplacement, vérification des liens et variables, aperçu ordinateur/téléphone, données de test et téléchargement de l’aperçu.
- Configurations sauvegardées et réutilisables ; paramètres de tracking, suffixe URL, footer et désabonnement.
- Préparer les variantes A/B et règles Smart Links par pays/appareil, avec destination de secours.
- Séparer **Save** de **Save & Publish** et afficher une checklist de validation avec les blocages précis.

## 3. Envoi réel et files d’attente
- Enregistrer les serveurs et interfaces autorisés, avec une sélection à deux colonnes et leur disponibilité réelle.
- Créer les jobs côté serveur, instantanés ou programmés, avec limites, lots, délais, rotation d’interface et reprise sans doubles envois.
- Brancher un fournisseur d’envoi autorisé ; aucun envoi direct depuis le navigateur.
- Tests multi-adresses avec état et réponse réels du fournisseur ; respecter les restrictions d’adresses définies par l’administrateur.
- Pause, reprise et arrêt confirmé ; nettoyage de file avec double confirmation, filtres et journalisation.
- Monitoring par campagne/serveur/domaine, rafraîchissement, retries et export.

**Prérequis pour cette partie :** un service d’envoi réellement configuré et accessible, ses accès sécurisés et, pour KumoMTA/SMTP, un service externe capable d’exécuter les envois. Les comptes DNS ne remplacent pas un serveur d’envoi. Tant que ce prérequis manque, afficher « non connecté » et ne jamais simuler une livraison réussie.

## 4. Suivi et pages complémentaires
- Aperçu complet, statistiques rapides et détaillées, logs filtrables avec destinataires masqués.
- Appliquer exactement les cinq formules du document et gérer les dénominateurs nuls.
- Relier les conversions existantes aux campagnes lorsque leurs références le permettent ; exports et filtres.
- Collecter les événements d’envoi, livraison, bounce, ouverture et clic avant d’afficher des répartitions par heure, serveur, pays ou appareil ; aucune statistique inventée.
- Redirections activables/bloquables, destinations de secours et webview publique sécurisée. Aucun JavaScript arbitraire provenant d’une campagne ne sera exécuté sur l’origine de Cortex.

## Détails techniques
- Conserver les pages protégées et le style de Cortex ; utiliser la couche de traduction existante.
- Ajouter progressivement les données de configuration et les tables opérationnelles utiles, sans créer des tables vides qui ne servent à aucun écran.
- Centraliser les transitions et règles testables ; renforcer les contrôles de publication, de contenu verrouillé et de permission dans la base, pas seulement dans les boutons.
- Utiliser des fonctions serveur authentifiées pour les commandes et un service d’envoi externe pour l’exécution durable ; préserver les clés chiffrées et les intégrations DNS/sponsors existantes.
- Tester les règles de statut, clones, destinataires, permissions, métriques et protection contre les doubles envois, puis vérifier création → sauvegarde → relecture avec un compte connecté.

## Ordre de réalisation
Commencer par les parties 1 et 2, utilisables sans serveur d’envoi. Continuer avec les pages de suivi disponibles, puis activer la partie 3 après configuration du service d’envoi ; valider alors une livraison réelle et son retour dans Cortex.