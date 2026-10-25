# Twinkly

Cette intégration relie Gladys à vos lumières LED **Twinkly** (guirlandes,
rideaux, sapins, Squares, Flex, Dots…). Gladys les pilote **en local**, sur
votre propre réseau : pas de compte, pas de cloud.

## Avant de commencer

- Installez d'abord chaque Twinkly avec l'**application Twinkly** et
  connectez-le à votre Wi-Fi.
- Il doit être sur le **même réseau** que Gladys.
- Gladys **5.3** ou plus.
- Conseillé : donnez-lui une **IP fixe** (réservation DHCP dans votre box).
  Si son IP change, l'intégration le retrouve, mais plus lentement.

Twinkly n'a pas d'API cloud publique : tout passe par le réseau local
(transport **local**).

## Configuration

| Champ                              | Rôle                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| **Adresses IP**                    | IP de vos Twinkly, séparées par des virgules. Facultatif si la recherche réseau les trouve. |
| **Recherche réseau**               | Cherche les Twinkly sur le réseau (diffusion UDP, port 5555). Activée par défaut.           |
| **Intervalle de rafraîchissement** | Fréquence de lecture de chaque Twinkly : 10 s, 15 s, 30 s ou 1 min.                         |
| **À l'allumage, jouer**            | Ce qu'affiche un Twinkly quand Gladys l'allume (par défaut : ce qu'il jouait en dernier).   |

Le bouton **Tester la connexion** cherche les Twinkly et liste ce qui répond :
nom, adresse, nombre de LED, version du firmware, mode en cours.

Le bouton **Identifier un Twinkly** lance sa démo pendant 5 secondes, puis le
remet comme il était : pratique pour savoir qui est qui.

### La recherche réseau ne trouve rien ?

Le conteneur de l'intégration ne voit pas la diffusion réseau : c'est Gladys
qui l'émet pour elle. Certains réseaux la bloquent (VLAN séparés, isolation
Wi-Fi des clients). Dans ce cas, saisissez simplement les **adresses IP**.

## Ajouter les appareils

Dans **Intégrations → Twinkly → Découverte**, lancez une recherche puis
ajoutez chaque Twinkly. Chacun devient une lumière avec :

| Fonction       | Ce qu'elle fait                                                                   |
| -------------- | --------------------------------------------------------------------------------- |
| **On/Off**     | Éteint (mode `off`) ou rallume (selon « À l'allumage, jouer »).                   |
| **Luminosité** | 0 à 100 %. Monter la luminosité d'un Twinkly éteint l'allume.                     |
| **Couleur**    | Couleur fixe (firmware 2.7.1 ou plus récent).                                     |
| **Scène**      | Liste des animations chargées depuis l'application, de la playlist et des effets. |

L'appareil garde son identité (basée sur l'adresse MAC) : changer son nom dans
l'application ou son IP ne crée pas de doublon.

Une nouvelle animation chargée depuis l'application ? Relancez une recherche
pour qu'elle apparaisse dans la liste **Scène**.

## Scènes (Gladys 5.1 et plus)

### Déclencheurs

| Déclencheur                     | Quand                                                                            | Variables                              |
| ------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| **Un Twinkly a changé de mode** | Le mode a changé **hors de Gladys** : application, bouton, minuterie du Twinkly. | `device_name`, `mode`, `previous_mode` |
| **Un Twinkly est injoignable**  | Il ne répond plus (débranché, Wi-Fi perdu…).                                     | `device_name`                          |
| **Un Twinkly répond à nouveau** | Il répond de nouveau.                                                            | `device_name`                          |

Un changement demandé par Gladys ne déclenche jamais « a changé de mode » :
une scène ne peut pas tourner en boucle.

Les changements sont vus à chaque lecture : avec un intervalle de 30 s, une
scène réagit en 30 s au plus.

### Actions

| Action                           | Paramètres                                                                     | Résultat           |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| **Jouer une animation Twinkly**  | Twinkly, nom de l'animation (ou numéro : 1 = première)                         | `movie` (nom joué) |
| **Jouer un effet Twinkly**       | Twinkly, numéro de l'effet (1 = premier)                                       | `effect`           |
| **Changer le mode d'un Twinkly** | Twinkly, mode : allumé, éteint, animation, effet, playlist, couleur fixe, démo | `mode` (appliqué)  |

Pour régler couleur et luminosité dans une scène, utilisez l'action standard
de Gladys « Contrôler un appareil ».

## Tableau de bord (Gladys 5.1 et plus)

Le widget **Twinkly** a deux vues, au choix dans ses réglages :

- **Sans Twinkly choisi** : une ligne par appareil (ce qu'il joue et sa
  luminosité, ou « Injoignable ») et deux boutons : **Tout allumer** et **Tout
  éteindre**.
- **Avec un Twinkly choisi** : sa luminosité en direct, son état, la scène en
  cours, sa couleur, son adresse IP, son nombre de LED, son firmware, et un jeu
  de boutons (réglage **Boutons**) :

  | Boutons         | Contenu                                                                               |
  | --------------- | ------------------------------------------------------------------------------------- |
  | Scènes (défaut) | Allumer/Éteindre, scène précédente, scène suivante, Identifier                        |
  | Luminosité      | Allumer/Éteindre, −10 %, +10 %, Max                                                   |
  | Modes           | Allumer/Éteindre, **Jouer…** (voir plus bas) et jusqu'à 2 modes : animation, playlist |
  | Couleurs        | Blanc, rouge, vert, bleu (couleur fixe, firmware 2.7.1+)                              |

  Une carte tient 4 boutons au plus : ajoutez le widget plusieurs fois pour
  avoir plusieurs jeux. Les scènes tournent en boucle dans l'ordre de la liste
  (animations, playlist, effets). La luminosité ne descend pas sous 10 % : pour
  éteindre, utilisez **Éteindre**.

  **Jouer…** ouvre un petit formulaire dans la carte : choisissez quoi jouer
  dans une seule liste — un mode (animation, playlist, couleur fixe, effet,
  démo), une des animations envoyées depuis l'application, ou un effet
  intégré — et, si vous le souhaitez, une luminosité (10 à 100 % ; laissez
  vide pour garder l'actuelle). Il est prérempli avec ce que joue le Twinkly.

## Dépannage

- **« Aucun Twinkly trouvé »** : vérifiez que le Twinkly répond dans
  l'application, puis saisissez son IP dans **Adresses IP**.
- **Un Twinkly passe « Injoignable »** : il est débranché, hors Wi-Fi, ou son IP
  a changé. L'intégration relance une recherche (au plus une fois toutes les
  5 minutes). Une IP fixe évite le problème.
- **L'application Twinkly et Gladys en même temps** : c'est possible. Si
  l'application prend la main, Gladys se reconnecte toute seule.
- Les journaux de l'intégration (page **Supervision** de Gladys) disent ce qui
  a été trouvé et ce qui ne répond pas.
