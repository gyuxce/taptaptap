# WAVR

Sistem pencatatan transaksi NFC dan digital souvenir untuk destinasi wisata,
dibangun dengan Next.js 16, React 19, Tailwind CSS v4, dan Supabase.

## Fitur

- Terminal merchant mobile dengan Web NFC.
- Pendaftaran wisatawan dan gelang NFC dari terminal loket.
- Pembayaran, top up, pembatasan kredit, dan pencegahan double tap.
- Dashboard admin, laporan, ekspor CSV, dan realtime feed.
- Pengelolaan akun serta status merchant.
- Notifikasi WhatsApp melalui Fonnte.
- Dukungan instalasi PWA.

## Persyaratan

- Node.js 20 atau lebih baru.
- Proyek Supabase aktif.
- Browser Android berbasis Chromium untuk Web NFC.
- HTTPS untuk pemindaian NFC di production.
- Token Fonnte bila notifikasi WhatsApp digunakan.

## Instalasi

```bash
git clone https://github.com/gyuxce/taptaptap.git
cd taptaptap
npm ci
Copy-Item .env.example .env.local
```

Isi `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FONNTE_TOKEN=your-fonnte-token
APP_ENV=development
OBSERVABILITY_WEBHOOK_URL=
```

Semua variabel Supabase wajib. Aplikasi tidak memiliki mode demo atau fallback
localStorage.

## Database

### POS dan Loyalty

Untuk mengaktifkan modul POS restaurant dan loyalty, jalankan sekali file berikut melalui Supabase SQL Editor:

`migrations/20260614_add_pos_loyalty.sql`

Migrasi ini menambahkan menu, order, detail order, ledger loyalty, pembayaran POS atomik, resume draft order, dan sinkronisasi refund.

1. Jalankan [schema.sql](./schema.sql) melalui Supabase SQL Editor.
2. Buat user administrator melalui Supabase Auth.
3. Tambahkan profil administrator:

```sql
INSERT INTO public.profiles (id, role, merchant_id, merchant_type)
VALUES ('UUID_USER_ADMIN', 'admin', null, null);
```

### Reset database kosong

Jika masih dalam tahap awal dan seluruh data WAVR boleh dihapus:

1. Jalankan [reset.sql](./reset.sql) sekali melalui Supabase SQL Editor.
2. Jalankan [schema.sql](./schema.sql).
3. Hapus user lama melalui menu **Authentication > Users** bila ingin akun
   benar-benar dimulai dari nol.
4. Buat kembali user admin, lalu tambahkan profil admin seperti query di atas.

`reset.sql` tidak menghapus user Supabase Auth secara otomatis agar tidak
menyentuh schema internal `auth`.

Jika database dibuat sebelum kolom telepon merchant ditambahkan, jalankan
[`migrations/20260613_add_merchant_phone.sql`](./migrations/20260613_add_merchant_phone.sql)
sekali. Database baru yang memakai `schema.sql` terbaru tidak memerlukannya.

Untuk mempercepat pembuatan merchant pada database yang sudah berjalan,
jalankan [`migrations/20260613_optimize_merchant_provisioning.sql`](./migrations/20260613_optimize_merchant_provisioning.sql)
sekali.

## Menjalankan Aplikasi

```bash
npm run dev
```

Akses melalui `http://localhost:3000`.

Untuk menguji dari HP pada Wi-Fi yang sama:

```bash
npm run dev:network
```

Buka `http://IP-LAPTOP:3000` dari HP. `localhost` pada HP menunjuk ke HP itu
sendiri. Cari alamat laptop dengan `ipconfig` dan pastikan Windows Firewall
mengizinkan Node.js pada jaringan Private.

Web NFC hanya tersedia dalam secure context. `localhost` dianggap aman untuk
pengembangan, tetapi akses melalui IP LAN biasanya tidak dapat menggunakan NFC.
Gunakan deployment HTTPS untuk pengujian NFC pada perangkat nyata.

## Verifikasi

```bash
npm run lint
npm test
npm run build
```

## Staging dan Production

Gunakan dua project Supabase terpisah. Jalankan `schema.sql` lebih dulu di
staging, buat akun untuk role admin, loket, dan merchant regular, lalu lakukan:

1. Login dan redirect untuk ketiga role.
2. Registrasi gelang oleh loket.
3. Top up oleh loket dan admin.
4. Payment merchant regular, saldo tidak cukup, dan double tap.
5. Dua request payment paralel dengan UID yang sama.
6. NFC Android melalui URL HTTPS, bukan alamat IP LAN.
7. Notifikasi WhatsApp dan status `sent`/`failed`.
8. Restore backup staging sebelum production.

Set `APP_ENV=staging` pada deployment staging dan `APP_ENV=production` pada
production. Tambahkan seluruh environment variable ke platform deployment.
Jangan pernah mengekspos `SUPABASE_SERVICE_ROLE_KEY` ke client atau repository.

Gunakan `.env.staging.example` sebagai daftar variabel untuk deployment staging.
Di Vercel, buat project staging terpisah atau gunakan Preview Environment yang
diarahkan ke project Supabase staging. Jangan menggunakan URL, anon key, maupun
service role key Supabase production pada staging.

Isi `EXPECTED_SUPABASE_PROJECT_REF` dengan bagian project ref dari URL Supabase.
Contoh untuk `https://abc123.supabase.co`, nilainya adalah `abc123`. Build
staging/production otomatis gagal jika project ref, label environment, atau
kredensial wajib tidak cocok.

## Quality Gate

Workflow `.github/workflows/quality.yml` otomatis menjalankan `npm ci`, lint,
test, dan production build pada setiap pull request serta push ke `main`.
Aktifkan branch protection di GitHub dan jadikan check **Quality Gate / verify**
sebagai syarat merge agar perubahan yang gagal verifikasi tidak masuk ke main.

## Monitoring dan Backup

Server menulis structured JSON log dan menangkap uncaught request error melalui
`instrumentation.ts`. `OBSERVABILITY_WEBHOOK_URL` dapat diarahkan ke collector
log/error milik tim. Platform seperti Vercel juga dapat mengindeks output JSON
tersebut.

Sentry telah terpasang dalam mode opsional. Buat project Next.js di Sentry lalu
isi variabel berikut pada staging dan production:

```bash
NEXT_PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
SENTRY_ORG=nama-organisasi
SENTRY_PROJECT=nama-project
SENTRY_AUTH_TOKEN=token-upload-source-map
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
```

`SENTRY_AUTH_TOKEN` hanya untuk environment server/build dan tidak boleh memakai
prefix `NEXT_PUBLIC_`. Gunakan sample rate `1` di staging untuk pengujian, lalu
turunkan ke `0.1` atau sesuai volume traffic di production. Jika DSN kosong,
Sentry otomatis nonaktif dan aplikasi tetap berjalan normal.

Aktifkan Point-in-Time Recovery Supabase untuk production. Tambahkan backup
terjadwal di luar provider, lalu uji restore secara berkala:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=wavr-$(Get-Date -Format yyyyMMdd).dump
pg_restore --clean --if-exists --dbname="$STAGING_DATABASE_URL" wavr-YYYYMMDD.dump
```

Jangan menguji restore pertama kali pada database production.
