import { z } from "zod";

// Mirrors the structure of the sample "Αποδελτίωση Διακήρυξης" document the
// user supplied: 6 sections covering basic tender info, deadlines, joint-venture
// participation rules, qualification criteria (incl. project-team requirements
// and ISO certificates), the full submission checklist, and closing warnings.
// Kept as a flat, mostly-string schema (rather than deeply typed enums) since
// real ΚΗΜΔΗΣ tenders vary a lot in exactly what they require - the model is
// asked to write each item as a complete, standalone sentence/phrase so the
// rendered output reads the same whether it came from a short or a very long
// Διακήρυξη.
export const ApodeltiosiSchema = z.object({
  titlos: z.string().describe("Ο πλήρης τίτλος της σύμβασης/διακήρυξης, όπως αναγράφεται στο έγγραφο"),
  arithmosDiakiryxis: z.string().describe("Αριθμός Διακήρυξης ή ΑΔΑΜ, αν αναφέρεται στο έγγραφο - αλλιώς κενό string"),
  basikaStoixeia: z.array(z.object({
    stoixeio: z.string().describe("Όνομα του στοιχείου, π.χ. 'Αναθέτουσα Αρχή', 'Εκτιμώμενη Αξία (χωρίς ΦΠΑ)', 'Κριτήριο Ανάθεσης', 'Διάρκεια Σύμβασης', 'Τύπος Διαγωνισμού', 'Α/Α ΕΣΗΔΗΣ', 'Πύλη Υποβολής', 'Επικοινωνία'"),
    plirofpria: z.string().describe("Η αντίστοιχη τιμή/πληροφορία"),
  })).describe("Πίνακας βασικών στοιχείων του διαγωνισμού - ό,τι θα χρειαζόταν κάποιος με μια ματιά: αναθέτουσα αρχή, τίτλος, αξία, Π/Υ με ΦΠΑ, κριτήριο ανάθεσης, διάρκεια σύμβασης, τύπος διαγωνισμού, στοιχεία ΕΣΗΔΗΣ/επικοινωνίας"),
  prothesmies: z.array(z.object({
    energeia: z.string().describe("Π.χ. 'Δημοσίευση', 'Καταληκτική ημ. υποβολής ερωτημάτων', 'Καταληκτική ημ. υποβολής προσφορών', 'Ηλεκτρονική αποσφράγιση προσφορών', 'Κατάθεση εγγυητικής επιστολής'"),
    imerominia: z.string().describe("Ημερομηνία/ώρα ή περιγραφή του πότε (π.χ. 'Έως 20 ημέρες πριν την υποβολή')"),
  })).describe("Χρονολογική λίστα όλων των κρίσιμων προθεσμιών του διαγωνισμού"),
  enosiEtaireion: z.object({
    genikesArxes: z.array(z.string()).describe("Γενικοί κανόνες συμμετοχής ως ένωση/κοινοπραξία εταιρειών"),
    ypoxreotikaStoixeia: z.array(z.string()).describe("Υποχρεωτικά στοιχεία που πρέπει να περιλαμβάνει η προσφορά μιας ένωσης"),
  }).nullable().describe("Πληροφορίες συμμετοχής ως ένωση/κοινοπραξία εταιρειών, ΜΟΝΟ αν το έγγραφο αναφέρει ρητά τέτοια ενότητα - null αν δεν υπάρχει καθόλου αναφορά σε ενώσεις/κοινοπραξίες"),
  kritiriaPoiotikisEpilogis: z.object({
    katallilotita: z.array(z.string()).describe("Απαιτήσεις καταλληλότητας/εγγραφής σε μητρώα, επιμελητήρια κ.λπ."),
    oikonomikiEparkeia: z.array(z.string()).describe("Απαιτήσεις οικονομικής επάρκειας - κύκλος εργασιών, ασφαλιστική κάλυψη κ.λπ."),
    texnikiIkanotita: z.array(z.string()).describe("Απαιτήσεις τεχνικής/επαγγελματικής ικανότητας - προηγούμενα έργα, εμπειρία κ.λπ."),
    omadaErgou: z.array(z.object({
      rolos: z.string().describe("Ο ρόλος/θέση στην ομάδα έργου, π.χ. 'Υπεύθυνος Έργου'"),
      prosonta: z.string().describe("Τα ελάχιστα απαιτούμενα προσόντα για αυτόν τον ρόλο"),
    })).describe("Απαιτούμενη ομάδα έργου/στελέχωση, αν αναφέρεται - κενή λίστα αν δεν υπάρχει τέτοια απαίτηση"),
    pistopoiitikaISO: z.array(z.object({
      pistopoiitiko: z.string().describe("Π.χ. 'ISO 9001:2015'"),
      pedio: z.string().describe("Πεδίο εφαρμογής του πιστοποιητικού"),
    })).describe("Απαιτούμενα πιστοποιητικά ISO, αν αναφέρονται - κενή λίστα αν δεν υπάρχουν"),
  }).describe("Κριτήρια ποιοτικής επιλογής του διαγωνισμού"),
  tiYpovalloume: z.object({
    dikaiologitikaSymmetoxis: z.array(z.string()).describe("Δικαιολογητικά συμμετοχής / τεχνική προσφορά που πρέπει να υποβληθούν"),
    oikonomikiProsfora: z.array(z.string()).describe("Απαιτήσεις της οικονομικής προσφοράς (μορφή, όρια τιμής κ.λπ.)"),
    isxysProsforas: z.array(z.string()).describe("Διάρκεια ισχύος της προσφοράς και σχετικοί όροι"),
    dikaiologitikaProsorinouAnadoxou: z.array(z.string()).describe("Δικαιολογητικά που θα ζητηθούν από τον προσωρινό ανάδοχο μετά την κατακύρωση"),
  }).describe("Πλήρης λίστα όσων πρέπει να υποβληθούν, ανά κατηγορία"),
  epishmanseis: z.array(z.string()).describe("Σημαντικές τελικές επισημάνσεις/προειδοποιήσεις - π.χ. τρόπος υποβολής, λόγοι απόρριψης, ειδικοί όροι"),
});

export type Apodeltiosi = z.infer<typeof ApodeltiosiSchema>;

export const APODELTIOSI_PROMPT = `Είσαι ειδικός σε δημόσιες συμβάσεις στην Ελλάδα. Σου δίνεται μια Διακήρυξη δημόσιου διαγωνισμού (ΕΣΗΔΗΣ/ΚΗΜΔΗΣ). Ανάλυσε το πλήρες κείμενο και παρήγαγε μια δομημένη αποδελτίωση, ακριβώς όπως θα την έγραφε ένα στέλεχος που ετοιμάζεται να καταθέσει προσφορά: πλήρη, συγκεκριμένα στοιχεία (ημερομηνίες, ποσά, κατώφλια) αντί για γενικόλογες περιγραφές, γραμμένα σε συνεχές, αυτοτελές κείμενο (κάθε στοιχείο πρέπει να βγάζει νόημα μόνο του, χωρίς να χρειάζεται τα συμφραζόμενα του εγγράφου). Αν μια ενότητα δεν υπάρχει καθόλου στο έγγραφο (π.χ. δεν αναφέρεται συμμετοχή ως ένωση εταιρειών), άφησέ την κενή/null όπως ορίζει το σχήμα - μην την επινοήσεις.`;
