# Data mapping used by MVP v0.2

Source sheet: `Δ-2024`.

Core mapping:
- Tender ID: `ΑΔΑΜ Διακήρυξης`
- Title: `Τίτλος Διακήρυξης`
- Publication: `Ημ. Δημοσίευσης`
- Opening: `Ημ. Αποσφράγισης`
- Authority: `Αναθέτουσα Αρχή.value`
- Procedure: `Τύπος Διαδικασίας.value`
- CPV: `Κωδικός CPV.key` + `Κωδικός CPV.value`
- Budget: `Εκτιμώμενη Αξία με ΦΠΑ`
- Award ADAM/date/value: `ΑΔΑΜ Ανάθεσης`, `Ημ. Ανάθεσης`, `Αξία Ανάθεσης`
- Contracts: `ΑΔΑΜ Σύμβασης 1..4`
- Contract dates: `Ημ.Σύμβασης (ΑΔΑΜ 1..4)`
- Delivery dates: `Ημ. Παράδοσης (ΑΔΑΜ 1..4)`
- Contractors: `Ανάδοχος (ΑΔΑΜ 1..4)`
- Contract values: `Αξία Σύμβασης με ΦΠΑ (1..4)`
- Total contract value: `Συνολική Αξία Σύμβασης`
