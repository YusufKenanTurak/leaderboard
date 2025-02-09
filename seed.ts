// seed.ts
import { Pool } from 'pg';
import { faker } from '@faker-js/faker';

// Dünyadaki tüm ülkeler (ISO 3166). Kısaltılmış:
const allCountries = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina",
  "Armenia","Aruba","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh",
  "Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina",
  "Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Côte d'Ivoire","Cabo Verde",
  "Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia",
  "Comoros","Costa Rica","Croatia","Cuba","Cyprus","Czechia","Democratic Republic of the Congo",
  "Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador",
  "Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Federated States of Micronesia",
  "Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada",
  "Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India",
  "Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan",
  "Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia",
  "Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives",
  "Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Moldova","Monaco","Mongolia",
  "Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand",
  "Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau",
  "Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar",
  "Republic of the Congo","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia",
  "Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia",
  "Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands",
  "Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname",
  "Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo",
  "Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine",
  "United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City",
  "Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"
];

const db = new Pool({
  connectionString: 'postgresql://admin:admin@localhost:5432/leaderboard',
});

async function main() {
  try {
    // 1) Countries + Players tabloları var mı?
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.countries (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        country_id INT NOT NULL,
        money BIGINT DEFAULT 0,
        FOREIGN KEY (country_id) REFERENCES public.countries(id)
      );
    `);

    // 2) Countries tablosu -> allCountries upsert
    console.log('Syncing countries table...');
    const countryIds = await updateCountriesTable(allCountries);
    console.log(`Total ${countryIds.length} countries exist in DB.`);

    // 3) Players tablosuna Faker veri ekle
    const totalPlayers = 1000000;  // 10 milyon
    const BATCH_SIZE = 10_000;
    console.log(`Will insert ${totalPlayers} players (batch size=${BATCH_SIZE}).`);

    let batchData: { name: string; countryId: number; money: number }[] = [];
    let insertedCount = 0;

    for (let i = 0; i < totalPlayers; i++) {
      const playerName = faker.person.fullName();
      const randomIndex = Math.floor(Math.random() * countryIds.length);
      const countryId = countryIds[randomIndex];
      const money = faker.number.int({ min: 100, max: 1_000_000 });

      batchData.push({ name: playerName, countryId, money });

      if (batchData.length === BATCH_SIZE || i === totalPlayers - 1) {
        await insertBatchPlayers(batchData);
        insertedCount += batchData.length;
        batchData = [];

        console.log(`Inserted so far: ${insertedCount} / ${totalPlayers}`);

        // Her batch sonrası stack’i boşaltmak + db nefes aldırmak
        await new Promise((res) => setImmediate(res));
      }
    }

    console.log(`All done. Inserted ${insertedCount} players total.`);

  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await db.end();
  }
}

/**
 * “allCountries” dizisindeki ülkeleri DB’ye ekler (DB’de yoksa).
 * Sonra DB’den (id) + name çekip “countryIds” dizisi döndürür.
 */
async function updateCountriesTable(countryList: string[]): Promise<number[]> {
  const { rows: existingRows } = await db.query<{ id: number; name: string }>(
    'SELECT id, name FROM public.countries'
  );
  const existingNames = new Set(existingRows.map((r) => r.name));

  let addedCount = 0;
  for (const cname of countryList) {
    if (!existingNames.has(cname)) {
      await db.query('INSERT INTO public.countries (name) VALUES ($1)', [cname]);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    console.log(`${addedCount} new countries added.`);
  } else {
    console.log('No new countries. All exist already.');
  }

  const { rows: finalRows } = await db.query<{ id: number }>('SELECT id FROM public.countries ORDER BY id');
  return finalRows.map((r) => r.id);
}

/**
 * Multi-values INSERT (10k satır tek seferde).
 * Her batch ekleme sonrası “stack” boşalacak şekilde “setImmediate” eklenmiştir.
 */
async function insertBatchPlayers(batchData: { name: string; countryId: number; money: number }[]) {
  if (batchData.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  let idx = 1;
  for (const p of batchData) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
    values.push(p.name, p.countryId, p.money);
    idx += 3;
  }

  const sql = `
    INSERT INTO public.players (name, country_id, money)
    VALUES ${placeholders.join(',')}
  `;
  await db.query(sql, values);
}

// Çalıştır
main().catch((err) => console.error('Main error:', err));
