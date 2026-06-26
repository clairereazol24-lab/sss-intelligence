#!/bin/bash

echo ""
echo "======================================"
echo "  LakiWin Intelligence - Setup Guide"
echo "======================================"
echo ""

# ── STEP 1: Check folder ──────────────────
echo "📁 STEP 1: Opening your project folder"
echo "   Folder: $(pwd)"
echo ""
read -p "Press ENTER to continue..."

# ── STEP 2: Supabase reminder ─────────────
echo ""
echo "🗄️  STEP 2: Supabase Setup (do this in your browser now)"
echo ""
echo "   1. Log in to your new Supabase account at supabase.com"
echo "   2. Create new project → name it: lakiwin"
echo "   3. Wait for it to load, then go to: SQL Editor"
echo "   4. Open the file: supabase/schema.sql from your lakiwin folder"
echo "   5. Paste the contents into the SQL Editor and click RUN"
echo "   6. Go to: Project Settings → API"
echo "   7. Copy your Project URL and anon/public key (you'll need them later)"
echo ""
read -p "Done with Supabase? Press ENTER to continue..."

# ── STEP 3: GitHub repo ───────────────────
echo ""
echo "🐙 STEP 3: Create GitHub Repository (in your browser)"
echo ""
echo "   1. Go to github.com → click New Repository"
echo "   2. Name it: lakiwin-intelligence"
echo "   3. Set to: Private"
echo "   4. Click Create Repository"
echo "   5. Copy the repo URL (e.g. https://github.com/YOUR_USERNAME/lakiwin-intelligence.git)"
echo ""
read -p "Paste your GitHub repo URL here: " REPO_URL

if [ -z "$REPO_URL" ]; then
  echo "❌ No URL entered. Please re-run setup.sh and enter your repo URL."
  exit 1
fi

# ── STEP 4: Git init and push ─────────────
echo ""
echo "🚀 STEP 4: Pushing code to GitHub"
echo ""
read -p "Press ENTER to run: git init..."
git init

read -p "Press ENTER to run: git add..."
git add .

read -p "Press ENTER to run: git commit..."
git commit -m "Initial commit - LakiWin Intelligence Engine"

read -p "Press ENTER to run: git branch -M main..."
git branch -M main

read -p "Press ENTER to run: git remote add origin..."
git remote add origin "$REPO_URL"

read -p "Press ENTER to run: git push..."
git push -u origin main

echo ""
echo "✅ Code pushed to GitHub!"

# ── STEP 5: Vercel ────────────────────────
echo ""
echo "▲  STEP 5: Deploy on Vercel (in your browser)"
echo ""
echo "   1. Log in to your new Vercel account at vercel.com"
echo "   2. Click: Add New → Project"
echo "   3. Connect GitHub and select: lakiwin-intelligence"
echo "   4. BEFORE clicking Deploy, add these 3 Environment Variables:"
echo ""
echo "      NEXT_PUBLIC_SUPABASE_URL     → your Supabase Project URL"
echo "      NEXT_PUBLIC_SUPABASE_ANON_KEY → your Supabase anon key"
echo "      ANTHROPIC_API_KEY             → your Claude API key"
echo ""
echo "   5. Click Deploy and wait ~2 minutes"
echo ""
read -p "Press ENTER once your Vercel app is live..."

# ── DONE ──────────────────────────────────
echo ""
echo "🎉 Setup Complete!"
echo ""
echo "Next steps:"
echo "   • Add Partner and DSP columns to your CSVs"
echo "   • Go to SSS Data and upload February → June data"
echo "   • Check Performance for your Top 20 rankings"
echo "   • Run your first AI Report"
echo ""
