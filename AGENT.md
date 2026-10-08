# AGENT.md — Maintenance du fork pi-web

> Ce fichier est destiné à l'agent chargé de **synchroniser ce fork avec le dépôt d'origine** (`agegr/pi-web`).
> Il est distinct de `AGENTS.md` (notes d'architecture, chargé automatiquement par Pi). **Pi ne charge pas `AGENT.md` tout seul** : lance l'agent avec une consigne explicite, par ex. `pi "Lis AGENT.md et exécute la procédure de synchronisation"`.

---

## 0. Emplacement

| Élément | Valeur |
| ------- | ------ |
| Dossier du fork | `/home/ubuntu/Workspace/soulkyu/pi-web` |
| Branche du fork (porte toutes les modifications) | `local` |
| Branche `main` | **miroir de `upstream/main`**, sans modification du fork |
| Binaire | `pi-web` (global) → `/home/ubuntu/Workspace/soulkyu/pi-web/bin/pi-web.js` |
| Lancement | `~/.local/bin/pi-web-hr` (bind `192.168.1.182:30141`) |

Toutes les commandes ci-dessous s'exécutent depuis `/home/ubuntu/Workspace/soulkyu/pi-web` :

```bash
cd /home/ubuntu/Workspace/soulkyu/pi-web
FORK=local
```

---

## 1. Mission

Ce dépôt est un **fork permanent** de [agegr/pi-web](https://github.com/agegr/pi-web).
Les modifications du fork **ne seront jamais proposées ni mergées upstream**.

Ton seul rôle : **ramener régulièrement les changements de l'upstream dans le fork, sans perdre les modifications propres au fork.**

Tu ne développes pas de nouvelles fonctionnalités, tu ne refactores pas, tu n'« améliores » pas le code upstream. Tu synchronises.

---

## 2. Remotes

| Remote     | URL                                    | Rôle                                  |
| ---------- | -------------------------------------- | ------------------------------------- |
| `origin`   | `git@github.com:SoulKyu/pi-web.git`    | lecture + écriture                    |
| `upstream` | `git@github.com:agegr/pi-web.git`      | **lecture seule** — ne jamais pousser |

Vérification / configuration au début de chaque session :

```bash
git remote -v
git remote get-url upstream 2>/dev/null || git remote add upstream git@github.com:agegr/pi-web.git
git remote set-url --push upstream DISABLED   # garde-fou : rend tout push vers upstream impossible
git config rerere.enabled true                # mémorise les résolutions de conflits récurrents
git config rerere.autoupdate true
```

Branche par défaut upstream : `main`. Branche du fork : `local` (section 0).

---

## 3. Stratégie : merge, jamais rebase

- `local` porte l'historique du fork → **on ne réécrit jamais son historique** (pas de `rebase`, pas de `push --force`). Exception assumée à la règle générale « rebase avant push » : un fork permanent se synchronise par merge.
- On intègre l'upstream par **merge** de `upstream/main` dans une branche de synchro, puis on ramène cette branche dans `local`.
- `git rerere` est activé pour que les conflits récurrents se résolvent seuls après la première fois. Toujours relire une résolution rerere avant de conclure le merge.

---

## 4. Procédure de synchronisation

### 4.1 Préparer

```bash
git fetch upstream --tags --prune
git fetch origin --prune
git switch "$FORK"
git status            # doit être propre ; sinon STOP et signaler
git push origin "$FORK"   # sauvegarde du fork avant toute opération
```

Voir ce qui arrive :

```bash
git log --oneline "$FORK"..upstream/main          # commits upstream à intégrer
git diff --stat "$FORK"...upstream/main           # fichiers touchés côté upstream
# fichiers modifiés des deux côtés = conflits probables :
comm -12 <(git diff --name-only upstream/main..."$FORK" | sort) <(git diff --name-only "$FORK"...upstream/main | sort)
```

S'il n'y a aucun commit nouveau → rien à faire, terminer en le signalant.

### 4.2 Merger dans une branche dédiée

```bash
BR="sync/upstream-$(date +%Y-%m-%d)"
git switch -c "$BR"
git merge --no-ff upstream/main -m "chore(sync): merge upstream/main ($(git rev-parse --short upstream/main))"
```

### 4.3 Résoudre les conflits

Un conflit ne survient que sur un fichier **modifié des deux côtés** : c'est donc toujours un fichier du fork. **Ne jamais résoudre un conflit avec `--theirs` ou `--ours` en bloc**, sauf pour `package-lock.json`.

Règles, dans l'ordre :

1. **Code (`lib/`, `components/`, `hooks/`, `app/`, `proxy.ts`, `bin/`, `instrumentation-node.ts`)** : conserver l'intention du fork **et** intégrer les évolutions upstream autour. Se référer à la section 7 et aux notes `docs/agents/*.md` de la zone.
2. **`package-lock.json`** : ne pas résoudre à la main. Prendre la version upstream, réappliquer les champs du fork dans `package.json`, puis régénérer :
   ```bash
   git checkout --theirs package-lock.json
   npm install
   git add package.json package-lock.json
   ```
3. **`package.json`** : prendre la version upstream (nouvelle `version`, nouvelles dépendances, scripts) puis réappliquer uniquement les champs propres au fork (section 7).
4. **`AGENTS.md`, `docs/agents/*.md`** : le fork y ajoute ses propres notes (agent-ops, agents long terme, finops…). Fusionner : garder les ajouts upstream **et** les sections du fork.
5. **`lib/i18n/messages/*.ts`** : garder les clés des deux côtés. `fr.ts` n'existe que dans le fork : y ajouter la traduction des nouvelles clés upstream.
6. **Fichier supprimé ou renommé upstream mais modifié dans le fork** : ne pas trancher seul → STOP et signaler (section 6).

Après résolution :

```bash
git diff --name-only --diff-filter=U   # doit être vide
git commit                             # conclut le merge
```

### 4.4 Vérifier

Depuis une session Pi, préfixer les commandes par `env -i PATH="$PATH" HOME="$HOME" LANG="$LANG"` : les variables `PI_*` héritées cassent les tests MCP/SDK (cf. `AGENTS.md` › Learned).

```bash
npm install
npm test
node_modules/.bin/tsc --noEmit
npm run lint
```

- **Ne pas lancer `npm run build` / `next build`** : réservé aux releases (écrit dans `.next/` et casse `npm run dev`).
- Node.js ≥ 22.19.0 requis.
- Si un test échoue, vérifier s'il échoue **aussi sur `upstream/main` seul** (`git worktree add /tmp/pi-web-upstream upstream/main`). Si oui, le noter dans le rapport sans le corriger. Si l'échec vient de l'interaction avec le fork, adapter le code du fork (minimalement) dans un commit séparé `fix(fork): …`.

Contrôle final que les modifs du fork sont toujours là :

```bash
git diff --stat upstream/main "$BR" | tail -1    # comparer au journal (section 8) : ~374 fichiers au 2026-10-08
git diff --name-only --diff-filter=M upstream/main "$BR" > /tmp/fork-modified.txt
```

Un fichier du fork qui redevient identique à l'upstream, ou une nouvelle différence hors des zones de la section 7, est une anomalie à expliquer.

### 4.5 Intégrer dans la branche du fork

```bash
git switch "$FORK"
git merge --ff-only "$BR"
git push origin "$FORK"
git push origin upstream/main:main    # garde main = miroir de l'upstream
git branch -d "$BR"
```

Si l'humain préfère relire avant : pousser `$BR` et ouvrir une PR **sur le fork** (base `local` de `SoulKyu/pi-web`, jamais vers `agegr/pi-web`).

---

## 5. Règles absolues

- ❌ Jamais de push vers `upstream`, jamais de PR vers `agegr/pi-web`.
- ❌ Jamais de `push --force`, jamais de rebase de `local`.
- ❌ Ne pas modifier le code upstream hors de ce qu'exige la résolution d'un conflit ou la compatibilité avec le fork.
- ❌ Ne pas publier sur npm, ne pas créer de tag/release.
- ❌ Ne pas toucher aux versions épinglées du SDK Pi (section 7) sans demande explicite.
- ✅ Un merge upstream = un commit de merge. Les corrections propres au fork = commits séparés préfixés `fix(fork):` ou `chore(fork):`.
- ✅ Pas de trailer `Co-Authored-By` ni de mention d'IA dans les commits.
- ✅ Toujours mettre à jour la section 8 (journal) après une synchro réussie.

---

## 6. Quand s'arrêter et demander

Stopper (sans pousser sur `local`) et signaler à l'humain si :

- un fichier modifié par le fork a été **supprimé, renommé ou profondément réécrit** upstream ;
- l'upstream change une API ou un comportement sur lequel repose une modification du fork, et l'adaptation n'est pas évidente ;
- l'upstream change la version du SDK `@earendil-works/*` (impact sur `lib/rpc-manager.ts`, `lib/pi-types.ts`, `lib/pi-sdk-internals.ts`) ;
- les vérifications échouent à cause des changements du fork et la correction n'est pas triviale ;
- le contrôle final (4.4) montre des différences inattendues ;
- l'upstream change de branche par défaut, de licence ou de structure majeure.

Dans ce cas : laisser la branche `sync/…` poussée sur `origin`, et rédiger un résumé : commits upstream concernés, fichiers en conflit, options possibles.

---

## 7. Modifications propres au fork

> **À tenir à jour.** Référence pour résoudre les conflits. État au 2026-10-08 : 374 fichiers diffèrent de l'upstream (278 ajoutés, 96 modifiés). La liste exacte se régénère avec `git diff --name-status upstream/main...local`.

| Zone | Nature | Règle en cas de conflit |
| ---- | ------ | ----------------------- |
| `AGENT.md` | Ce fichier (n'existe pas upstream) | Toujours la version du fork |
| `lib/agent-ops/`, `app/api/agent-ops/` | Ajout : tâches, runner FIFO, triggers, webhooks, revue mémoire pi-mem0 | Fork (pas de conflit attendu, fichiers ajoutés) |
| `lib/agents/`, `app/api/agents/`, `components/agents/` | Ajout : agents long terme (thread épinglé, file de tâches, mémoire, avatars) | Fork |
| `lib/rpc-manager.ts`, `lib/session-reader.ts`, `lib/subagents.ts` | Modifié : profils d'agent, env des sessions, événements d'agent | Fusion manuelle, garder les deux |
| `components/AppShell.tsx`, `ChatWindow.tsx`, `MessageView.tsx`, `SessionSidebar.tsx`, `ChatInput.tsx` | Modifié : rail des agents, cartes d'événements, UX | Fusion manuelle |
| `lib/i18n/messages/*.ts` | `fr.ts` ajouté ; clés ajoutées dans `en`, `zh-CN`, `zh-TW` | Union des clés |
| `lib/deferred-provider-models.ts`, `lib/cost-equivalent.ts`, `lib/web-push.ts`, `components/MemoryConfig.tsx`, `components/AgentProfileSelector.tsx` | Ajouts/modifs : providers déclarés au `session_start`, coût équivalent, push, mémoire | Fork |
| `AGENTS.md`, `docs/agents/*.md` | Sections ajoutées (agent-ops, long-term-agents, finops) | Fusion : upstream + sections du fork |
| `docs/superpowers/` | Plans et specs du fork (ajoutés) | Fork |

Champs `package.json` propres au fork :

- SDK Pi épinglé en version exacte : `@earendil-works/pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui` = `1.0.4` (upstream : `1.0.0`).
- `remark-cjk-friendly` : **dépendance ajoutée upstream** (`6d4d6b5`, #1072, emphase markdown à côté de la ponctuation CJK). Le fork ne l'a jamais retirée : la garder lors de la synchro (accepter l'ajout upstream dans `package.json` et le lock).
- `name`, `version`, `repository` : identiques à l'upstream (`@agegr/pi-web`), à garder tels quels.

---

## 8. Journal des synchronisations

| Date | Commit upstream intégré | Conflits | Remarques |
| ---- | ----------------------- | -------- | --------- |
| 2026-10-08 | — (base : `6fcd7d4` Release v0.10.0) | — | État initial : `local` a 231 commits d'avance, upstream 22 de retard à intégrer (jusqu'à `a096af3`) |

---

## 9. Rapport de fin de synchro

À la fin de chaque exécution, produire un court résumé :

- nombre de commits upstream intégrés et plage (`abc1234..def5678`) ;
- fichiers en conflit et comment ils ont été résolus ;
- résultat de `npm test`, `tsc --noEmit`, `npm run lint` ;
- éventuels commits `fix(fork):` ajoutés ;
- points nécessitant une décision humaine.
