/**
 * Starter formulary catalog for prescription-composer autocomplete
 * (docs/36-SEED-DATA.md "Catalog seed"). Not clinically exhaustive — a real
 * deployment would import a licensed formulary; this is enough to make the
 * feature usable and demonstrable.
 */
export interface MedicationSeed {
  name: string;
  genericName?: string;
  form: string;
  strength?: string;
}

export const MEDICATION_SEEDS: MedicationSeed[] = [
  { name: "Amoxicillin", genericName: "Amoxicillin", form: "Tablet", strength: "500mg" },
  { name: "Azithromycin", genericName: "Azithromycin", form: "Tablet", strength: "250mg" },
  { name: "Ciprofloxacin", genericName: "Ciprofloxacin", form: "Tablet", strength: "500mg" },
  { name: "Doxycycline", genericName: "Doxycycline", form: "Capsule", strength: "100mg" },
  { name: "Paracetamol", genericName: "Acetaminophen", form: "Tablet", strength: "650mg" },
  { name: "Ibuprofen", genericName: "Ibuprofen", form: "Tablet", strength: "400mg" },
  { name: "Aspirin", genericName: "Acetylsalicylic acid", form: "Tablet", strength: "75mg" },
  { name: "Diclofenac", genericName: "Diclofenac sodium", form: "Tablet", strength: "50mg" },
  { name: "Omeprazole", genericName: "Omeprazole", form: "Capsule", strength: "20mg" },
  { name: "Pantoprazole", genericName: "Pantoprazole", form: "Tablet", strength: "40mg" },
  { name: "Ranitidine", genericName: "Ranitidine", form: "Tablet", strength: "150mg" },
  { name: "Metformin", genericName: "Metformin", form: "Tablet", strength: "500mg" },
  { name: "Glimepiride", genericName: "Glimepiride", form: "Tablet", strength: "2mg" },
  { name: "Insulin Glargine", genericName: "Insulin glargine", form: "Injection", strength: "100IU/mL" },
  { name: "Amlodipine", genericName: "Amlodipine", form: "Tablet", strength: "5mg" },
  { name: "Losartan", genericName: "Losartan potassium", form: "Tablet", strength: "50mg" },
  { name: "Atenolol", genericName: "Atenolol", form: "Tablet", strength: "50mg" },
  { name: "Enalapril", genericName: "Enalapril maleate", form: "Tablet", strength: "5mg" },
  { name: "Atorvastatin", genericName: "Atorvastatin", form: "Tablet", strength: "10mg" },
  { name: "Rosuvastatin", genericName: "Rosuvastatin", form: "Tablet", strength: "10mg" },
  { name: "Cetirizine", genericName: "Cetirizine", form: "Tablet", strength: "10mg" },
  { name: "Loratadine", genericName: "Loratadine", form: "Tablet", strength: "10mg" },
  { name: "Montelukast", genericName: "Montelukast", form: "Tablet", strength: "10mg" },
  { name: "Salbutamol", genericName: "Salbutamol", form: "Inhaler", strength: "100mcg/dose" },
  { name: "Budesonide", genericName: "Budesonide", form: "Inhaler", strength: "200mcg/dose" },
  { name: "Prednisolone", genericName: "Prednisolone", form: "Tablet", strength: "5mg" },
  { name: "Hydrocortisone Cream", genericName: "Hydrocortisone", form: "Topical Cream", strength: "1%" },
  { name: "Metronidazole", genericName: "Metronidazole", form: "Tablet", strength: "400mg" },
  { name: "Ondansetron", genericName: "Ondansetron", form: "Tablet", strength: "4mg" },
  { name: "Domperidone", genericName: "Domperidone", form: "Tablet", strength: "10mg" },
  { name: "Loperamide", genericName: "Loperamide", form: "Capsule", strength: "2mg" },
  { name: "Oral Rehydration Salts", genericName: "ORS", form: "Sachet" },
  { name: "Folic Acid", genericName: "Folic acid", form: "Tablet", strength: "5mg" },
  { name: "Iron + Folic Acid", genericName: "Ferrous sulfate + folic acid", form: "Tablet" },
  { name: "Vitamin D3", genericName: "Cholecalciferol", form: "Tablet", strength: "60000IU" },
  { name: "Vitamin B Complex", form: "Tablet" },
  { name: "Calcium Carbonate", genericName: "Calcium carbonate", form: "Tablet", strength: "500mg" },
  { name: "Levothyroxine", genericName: "Levothyroxine sodium", form: "Tablet", strength: "50mcg" },
  { name: "Sertraline", genericName: "Sertraline", form: "Tablet", strength: "50mg" },
  { name: "Escitalopram", genericName: "Escitalopram", form: "Tablet", strength: "10mg" },
  { name: "Alprazolam", genericName: "Alprazolam", form: "Tablet", strength: "0.25mg" },
  { name: "Amitriptyline", genericName: "Amitriptyline", form: "Tablet", strength: "25mg" },
  { name: "Gabapentin", genericName: "Gabapentin", form: "Capsule", strength: "300mg" },
  { name: "Tramadol", genericName: "Tramadol", form: "Capsule", strength: "50mg" },
  { name: "Diazepam", genericName: "Diazepam", form: "Tablet", strength: "5mg" },
  { name: "Clopidogrel", genericName: "Clopidogrel", form: "Tablet", strength: "75mg" },
  { name: "Warfarin", genericName: "Warfarin sodium", form: "Tablet", strength: "5mg" },
  { name: "Furosemide", genericName: "Furosemide", form: "Tablet", strength: "40mg" },
  { name: "Spironolactone", genericName: "Spironolactone", form: "Tablet", strength: "25mg" },
  { name: "Amoxicillin-Clavulanate", genericName: "Co-amoxiclav", form: "Tablet", strength: "625mg" },
];
