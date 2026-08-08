# Procurement PMO Intelligence — MVP v0.2

Η εφαρμογή έχει προσαρμοστεί στο `Master-File_06082026.xlsx` και χρησιμοποιεί το ενοποιημένο φύλλο `Δ-2024`.

## Περιλαμβάνει

- Όλες τις Αναθέτουσες Αρχές με global filter.
- Φίλτρο CPV (κωδικός ή περιγραφή).
- Active / lifecycle status.
- Λίστα διαγωνισμών.
- Καρτέλα διαγωνισμού με lifecycle:
  - Δημοσίευση
  - Υποβολή (εμφανίζεται ως μη διαθέσιμη, επειδή δεν υπάρχει ξεχωριστό πεδίο στο Master)
  - Αποσφράγιση
  - Αξιολόγηση (proxy period: Αποσφράγιση → Ανάθεση)
  - Ανάθεση
  - Σύμβαση
  - Παράδοση
- Gantt ανά διαγωνισμό.
- Έως 4 συμβάσεις / αναδόχους ανά διαγωνισμό.
- Competition Mapping ανά CPV: ανάδοχος, αριθμός συμβάσεων, αξία, Αναθέτουσες Αρχές και αντικείμενο.
- Dashboard πρώτης έκδοσης.

## Εκτέλεση

```bash
python -m venv .venv
```

Windows:
```bash
.venv\Scripts\activate
```

macOS/Linux:
```bash
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
streamlit run app.py
```

Η βάση `procurement.db` περιλαμβάνεται ήδη και έχει δημιουργηθεί από το Master που δόθηκε στη συζήτηση.

## Σημαντική παρατήρηση δεδομένων

Το Master δεν έχει ξεχωριστή ημερομηνία `Υποβολής` ούτε ξεχωριστή ημερομηνία ολοκλήρωσης `Αξιολόγησης`. Η εφαρμογή δεν κατασκευάζει ψευδή milestones. Χρησιμοποιεί ως proxy την περίοδο `Αποσφράγιση → Ανάθεση` για την αξιολόγηση.

## Επόμενη έκδοση

- API ingestion από ΚΗΜΔΗΣ/ΕΣΗΔΗΣ.
- Incremental refresh αντί για Excel import.
- PostgreSQL για multi-user χρήση.
- User-managed PMO milestones για Submission / Evaluation όπου δεν παρέχονται από το API.
- Bid/no-bid analytics και forecasting.
