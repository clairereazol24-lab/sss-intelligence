# LakiWin Intelligence Engine - Setup Guide

## Step 1: Supabase Setup

1. Log in to your new Supabase account at supabase.com
2. Create a new project (name it `lakiwin`)
3. Wait for it to provision (~1 min)
4. Go to **SQL Editor** and paste the entire contents of `supabase/schema.sql`
5. Click **Run**
6. Go to **Project Settings → API**
7. Copy:
   - **Project URL** → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Step 2: GitHub Setup

1. Go to github.com and create a new repository (name: `lakiwin-intelligence`)
2. Set it to **Private**
3. Download or copy all the project files into that repo
4. Push to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lakiwin-intelligence.git
git push -u origin main
```

---

## Step 3: Vercel Setup

1. Log in to your new Vercel account at vercel.com
2. Click **Add New → Project**
3. Connect your GitHub account and select `lakiwin-intelligence`
4. Before deploying, click **Environment Variables** and add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `ANTHROPIC_API_KEY` | Your Claude API key |

5. Click **Deploy**

---

## Step 4: First Use

1. Open your Vercel app URL
2. Go to **SSS Data**
3. Before uploading your CSV, open it in Excel/Google Sheets and add two columns:
   - `Partner` → type `Relevant Tech` or `Alpharus` for each row
   - `DSP` → type the DSP name for each store
4. Upload February first, select Month: February, Year: 2024
5. Repeat for March, April, May, June
6. Go to **Performance** to see rankings
7. Go to **AI Report** → select period → Generate

---

## Uploading Daily Data (from June 22 onwards)

Same process as monthly, but select **Daily** and pick the date.

---

## Notes

- The AI Report uses Claude Sonnet. Each report costs ~$0.01–0.05 in API credits.
- Supabase free tier: 500MB storage, plenty for this use case.
- Vercel free tier: sufficient for team use.
- When Alpharus data arrives: add `Partner=Alpharus` and their DSP names before uploading.
