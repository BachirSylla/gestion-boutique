# 0005 — Connexion par téléphone via un e-mail interne `.invalid`

**Date** : 24 oct. 2026 · **Statut** : acceptée

## Contexte
L'identifiant est le numéro de téléphone + un mot de passe, sans SMS ni inscription publique. Supabase Auth exige un fournisseur SMS pour activer la connexion par téléphone.

## Options
1. Fournisseur Auth « Phone » de Supabase : demande un fournisseur SMS (Twilio…), payant, inutile ici.
2. **E-mail interne dérivé du numéro**, créé déjà confirmé par le serveur.
3. Auth maison : hors de question (sécurité, maintenance).

## Choix
Option 2. Le numéro est normalisé en E.164 (`+221776148991`) puis transformé en `221776148991@phone.bitig.invalid` (`loginEmailFromPhone`, testé).

- `.invalid` est un TLD réservé (RFC 2606) : aucun e-mail ne peut partir ni être routé, aucun domaine à posséder.
- **Vérifié le 24 oct. 2026** sur le projet : Supabase Auth accepte la création (`email_confirm: true`) et la connexion par mot de passe avec cette adresse. Les utilisateurs de test ont été supprimés.
- L'utilisateur ne voit jamais cette adresse : il saisit son numéro sous n'importe quelle forme (`77 614 89 91`, `+221…`, `00221…`).
- Inscriptions publiques **désactivées** dans Supabase Auth ; seuls le serveur (clé secrète) et le script de démarrage créent des comptes.
- Le téléphone est aussi stocké en clair dans `profile_contacts` / `platform_admins` (unique), pour l'affichage et la recherche.

## Observations et point de vigilance
- L'endpoint public d'**inscription** (`/auth/v1/signup`) refuse `…@phone.bitig.invalid` (`email_address_invalid`). Sans conséquence : les inscriptions sont fermées et les comptes sont créés par l'API d'administration, qui accepte l'adresse. La **connexion** (`/auth/v1/token`) l'accepte aussi (vérifié en production et par les tests de bout en bout).
- Si Supabase venait à valider le domaine aussi à la connexion, il suffirait de changer `LOGIN_EMAIL_DOMAIN` pour un sous-domaine que l'on possède (ex. `phone.bitig.app`, sans MX) et de migrer les e-mails des comptes existants côté serveur. Les tests e2e le détecteraient immédiatement.

## Connexion depuis le navigateur
La connexion (`signInWithPassword`) est faite **depuis le navigateur**, pas par une Server Action : chaque appareil parle directement à Supabase Auth. Sinon toutes les connexions partiraient de l'adresse du serveur Vercel et partageraient la même limite de débit de Supabase. La session est posée dans les cookies et relue par le serveur et le proxy. Le contrôle « compte désactivé / propriétaire suspendu / sans boutique » est fait côté serveur à l'arrivée sur l'application, qui déconnecte le compte avec un message (`/auth/denied`).

## Conséquences
- « Mot de passe oublié » par e-mail impossible, comme voulu : la réinitialisation est faite par l'admin ou le propriétaire.
- Changer le numéro d'un utilisateur = changer son e-mail Auth côté serveur (jalon 2).
