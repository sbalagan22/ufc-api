# UFC Event Schedule Web Application

A comprehensive UFC event schedule web application with real-time voting system, fighter profiles, AI analysis, chatroom, and user authentication. Built with vanilla JavaScript, HTML, CSS, and Supabase for backend services.

## 🏆 Features

### Core Features
- **UFC Event Schedule**: Display upcoming and past UFC events with detailed fight cards
- **Fighter Profiles**: Comprehensive fighter statistics, records, and information
- **Real-time Voting System**: Vote on main card fights with live percentage updates
- **User Authentication**: Secure login/signup with email verification via Supabase
- **AI Analysis**: AI-powered fight predictions with community voting
- **Live Chatroom**: Real-time chat with moderation and character limits
- **Responsive Design**: Mobile-friendly interface with modern UI

### Advanced Features
- **Vote Validation**: One vote per user per fight, no vote changes allowed
- **Content Moderation**: Bad word filtering in chat with bypass detection
- **Profile Management**: Username validation and profile modal
- **Notification System**: Silent feedback without intrusive alerts
- **Data Scraping**: Python scripts for UFC data collection

## 📁 Project Structure

```
ufc/
├── index.html                 # Main HTML entry point
├── src/
│   ├── js/
│   │   ├── script.js         # Main application logic
│   │   └── supabase-config.js # Supabase configuration & auth
│   ├── css/
│   │   └── styles.css        # Application styles
│   └── data/
│       ├── ufc_events.json   # UFC event data
│       ├── fighter_profiles.json # Fighter profile data
│       ├── predictions.json  # AI predictions data
│       └── fighter_names.txt # Fighter name list
├── scripts/
│   ├── generate_predictions.py    # AI prediction generator
│   ├── scrape_fighter_profiles.py # Fighter data scraper
│   └── scrape_ufc_playwright.py  # UFC event scraper
├── docs/                     # Documentation
├── package.json              # Node.js dependencies
└── README.md                # This file
```

## 🚀 Quick Start

### Prerequisites
- Modern web browser
- Supabase account (free tier available)
- Python 3.7+ (for data scraping scripts)

### 1. Supabase Setup

1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key

### 2. Database Configuration

Run this SQL in your Supabase SQL Editor:

```sql
-- Create votes table for fight voting
CREATE TABLE votes (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bout_id TEXT NOT NULL,
  fighter_index INTEGER NOT NULL CHECK (fighter_index IN (0, 1)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, bout_id)
);

-- Create thumbs_votes table for AI analysis voting
CREATE TABLE thumbs_votes (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bout_id TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, bout_id)
);

-- Enable Row Level Security
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE thumbs_votes ENABLE ROW LEVEL SECURITY;

-- Create policies for votes table
CREATE POLICY "Users can insert their own votes" ON votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view all votes" ON votes
  FOR SELECT USING (true);

-- Create policies for thumbs_votes table
CREATE POLICY "Users can insert their own thumbs votes" ON thumbs_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view all thumbs votes" ON thumbs_votes
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own thumbs votes" ON thumbs_votes
  FOR UPDATE USING (auth.uid() = user_id);
```

### 3. Configuration

1. Open `src/js/supabase-config.js`
2. Replace `YOUR_SUPABASE_URL` with your project URL
3. Replace `YOUR_SUPABASE_ANON_KEY` with your anon key

### 4. Run the Application

1. Open `index.html` in a web browser
2. Click "Sign Up" to create an account
3. Verify your email (check inbox)
4. Log in and start exploring!

## 🎯 How It Works

### Authentication Flow
1. User clicks "Sign Up" or "Login"
2. User enters email, password, and username (for signup)
3. Email verification required for new accounts
4. User logs in with verified credentials
5. Profile button appears with username display

### Voting System
- **Main Card Voting**: Only main card fights show voting bars
- **One Vote Per Fight**: Users can only vote once per fight
- **Real-time Updates**: Voting percentages update immediately
- **Vote Validation**: Votes cannot be changed once submitted
- **Latest Event Only**: Voting only applies to the most recent event

### AI Analysis
- **Thumbs Up/Down**: Vote on AI predictions
- **Toggle Voting**: Change votes on AI analysis
- **Vote Counts**: Display current vote totals
- **Community Feedback**: Track prediction accuracy

### Chatroom Features
- **280 Character Limit**: Prevent spam messages
- **Real-time Updates**: Live message display
- **Content Moderation**: Bad word filtering
- **User Authentication**: Must be logged in to chat

## 🛠️ Data Management

### Data Scraping Scripts

The `scripts/` directory contains Python scripts for data collection:

- **`scrape_ufc_playwright.py`**: Scrapes UFC event data
- **`scrape_fighter_profiles.py`**: Collects fighter profile information
- **`generate_predictions.py`**: Generates AI predictions

### Running Data Scripts

```bash
# Install Python dependencies
pip install playwright requests beautifulsoup4

# Scrape UFC events
python scripts/scrape_ufc_playwright.py

# Scrape fighter profiles
python scripts/scrape_fighter_profiles.py

# Generate predictions
python scripts/generate_predictions.py
```

## 🎨 Customization

### Styling
- Modify `src/css/styles.css` for visual changes
- Voting bar colors and layouts
- Modal designs and animations
- Responsive breakpoints

### Functionality
- Add new voting validation rules
- Implement additional chat features
- Extend AI analysis capabilities
- Add social sharing features

## 🔒 Security Features

- **Row Level Security (RLS)**: Database-level access control
- **Email Verification**: Required for new accounts
- **Password Requirements**: Minimum length and complexity
- **Username Validation**: Unique usernames with format checking
- **Content Moderation**: Bad word filtering in chat
- **Vote Protection**: Prevents duplicate and changed votes

## 📱 Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🐛 Troubleshooting

### Common Issues

**Voting not working:**
- Ensure you're logged in
- Check that you're voting on the latest event
- Verify Supabase configuration

**Chat not loading:**
- Check internet connection
- Verify Supabase real-time is enabled
- Ensure user is authenticated

**Data not updating:**
- Run data scraping scripts
- Check file paths in JavaScript
- Verify JSON file format

### Support

For issues and questions:
1. Check the browser console for errors
2. Verify Supabase configuration
3. Ensure all dependencies are installed
4. Check file paths and permissions

## 🚀 Future Enhancements

- [ ] Mobile app version
- [ ] Advanced analytics dashboard
- [ ] Social media integration
- [ ] Live event streaming
- [ ] Fighter comparison tools
- [ ] Historical data analysis
- [ ] Advanced chat features
- [ ] Push notifications 

If you want to run a local server to serve your static files (such as `index.html`), you can use Python’s built-in HTTP server. Here’s the command for Python 3:

```sh
python3 -m http.server 8000
```

This will serve your files at http://localhost:8000.

**If you have a backend server (e.g., Flask, Node.js, etc.) that is not shown in the current file list, please specify the file or framework, and I can provide the exact run command.**

Let me know if you need a different server setup or if you have a backend file you want to run! 