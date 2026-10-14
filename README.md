# Aktivitetsdag

<img src="assets/logo.svg" alt="Logo" width="96">

En enkel nettside som hjelper trenere å planlegge aktivitetsdager i barneidrett, enten det er ishockey, fotball, håndball eller noe annet:

- **Laginndeling** – velg antall spillere per lag (eller antall lag). Siden blander spillerne slik at de får nye lagkamerater fra gang til gang.
- **Kampoppsett** – legg inn lagene som kommer på besøk, baner og tidspunkter. Siden lager et oppsett der alle lag får like mange kamper, helst mot andre klubber og uten to (eller tre) kamper på rad. Du kan også kreve at alle lag spiller nøyaktig like mange kamper.
- **Oppgaver** – fordeler oppgaver (kiosk, opprigg, kakebaking …) mellom foreldrene, og sparer de som hadde oppgaver sist.
- **Dommere** – fordeler dommere på kampene så likt som mulig.
- **Regler og råd** – kortversjon av idrettens barnerettigheter og bestemmelser om barneidrett (NIF), med lenke til originalen.
- **PDF** – alt kan skrives ut eller lagres som PDF, hver side for seg eller alt samlet.

Alt lagres i nettleseren du bruker. Ingen innlogging, ingen server. Med «Lagre til fil» under Innstillinger (tannhjulet øverst) kan du ta med dataene til en annen maskin eller dele dem med en annen trener.

Under Innstillinger ligger også brukermanualen (`docs/brukermanual.pdf`), valg av lys eller mørk visning og «Slett alt».

## Slik bruker du siden

1. **Dagen**: Fyll inn tittel, idrett, dato, sted, klubb og årsklasse.
2. **Laginndeling**: Lim inn spillerlisten, velg antall per lag og trykk «Lag laginndeling». Flytt spillere manuelt hvis du vil.
3. **Kampoppsett**: Legg til besøkende lag, sett opp baner og tider, og trykk «Lag kampoppsett». Du kan endre hver kamp i tabellen etterpå.
4. **Oppgaver** og **Dommere**: Trykk på knappene for å fordele automatisk, og juster etter behov.
5. Trykk **PDF** øverst til høyre, velg hva som skal være med, og trykk «Last ned PDF» (eller «Skriv ut»).
6. Etter aktivitetsdagen: gå til **Dagen**, trykk «Lagre dagen i historikken» og så «Start ny aktivitetsdag». Da roterer lagene neste gang.

## Publisere siden gratis med GitHub Pages

1. Gå til repoet på github.com.
2. Trykk **Settings** (tannhjulet øverst).
3. Velg **Pages** i menyen til venstre.
4. Under **Build and deployment** → **Source**, velg **Deploy from a branch**.
5. Under **Branch**, velg `main` (eller `master`) og mappen `/ (root)`, og trykk **Save**.
6. Vent et par minutter. Adressen til siden vises øverst på samme side, typisk `https://stillerflaten.github.io/Aktivitetsdag/`.

## Teste lokalt

Dobbeltklikk på `index.html`, så åpnes siden i nettleseren. Det trengs ingen installasjon.

## Filer

- `index.html` – selve siden
- `css/style.css` – utseende, inkludert utskrift/PDF
- `js/state.js` – lagring av data i nettleseren
- `js/algorithms.js` – fordeling av lag, kamper, dommere og oppgaver
- `js/print.js` – utskriftsversjonene (PDF)
- `js/app.js` – knapper, skjemaer og tabeller
- `docs/brukermanual.pdf` – brukermanual for trenere med skjermbilder (bare oppdiktede navn)
- `assets/` – logo (`logo.svg`), appikon i 1024 × 1024 for App Store (`app-icon-1024.png`, uten gjennomsiktighet og avrundede hjørner) og ikoner for nettleser og hjemskjerm
