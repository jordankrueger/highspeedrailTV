# YouTube Data API Setup Guide

Follow these steps to get your free YouTube Data API key:

## Step 1: Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Sign in with your Google account

## Step 2: Create a New Project

1. Click the project dropdown at the top of the page (next to "Google Cloud")
2. Click **"New Project"**
3. Name it something like `highspeedrail-tv`
4. Click **"Create"**
5. Wait for the project to be created, then select it

## Step 3: Enable the YouTube Data API

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for **"YouTube Data API v3"**
3. Click on it, then click **"Enable"**

## Step 4: Create API Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ Create Credentials"** at the top
3. Select **"API key"**
4. Your API key will be displayed - **copy it now!**

## Step 5: (Optional but Recommended) Restrict Your API Key

1. Click on your newly created API key
2. Under **"API restrictions"**, select **"Restrict key"**
3. Choose **"YouTube Data API v3"** from the dropdown
4. Click **"Save"**

## Step 6: Add to Your Project

Create a `.env` file in your `highspeedrailTV` folder:

```
YOUTUBE_API_KEY=your_api_key_here
ADMIN_PASSWORD=choose_a_secure_password
```

**Important:** Add `.env` to your `.gitignore` file so you don't accidentally commit your secrets!

## API Quota Information

The YouTube Data API has a free quota of **10,000 units per day**. Here's what operations cost:

| Operation | Cost |
|-----------|------|
| Search | 100 units |
| Get video details | 1 unit |
| Get channel info | 1 unit |

This means you can do approximately **100 searches per day** for free, which is plenty for curating content.

## Next Steps

Once you have your API key:
1. Add it to your `.env` file
2. Run `npm run admin` to start the admin server
3. Visit `http://localhost:3000/admin` to access the video discovery tool

---

*Need help? The Google Cloud Console interface changes occasionally, but the general flow remains the same. Look for "APIs & Services" in the navigation.*
