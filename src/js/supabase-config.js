// Supabase configuration
const SUPABASE_URL = 'https://svbqpxnhiajakkiaacap.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YnFweG5oaWFqYWtraWFhY2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwOTY4MDQsImV4cCI6MjA2NzY3MjgwNH0.g9dJ6LiJAuAL8X3_uI7xlnuUcj_j8TaivEJsa9lBzUw'; // Replace with your Supabase anon key

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Authentication state
let currentUser = null;

// Check if user is logged in
async function checkAuth() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    updateAuthUI();
    return user;
  } catch (error) {
    console.error('Auth check error:', error);
    currentUser = null;
    updateAuthUI();
    return null;
  }
}

// Sign up with email and password
async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
  });
  
  if (error) {
    throw error;
  }
  
  return data;
}

// Sign in with email and password
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });
  
  if (error) {
    throw error;
  }
  
  currentUser = data.user;
  updateAuthUI();
  return data;
}

// Sign out
async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
  
  currentUser = null;
  updateAuthUI();
}

// Update authentication UI
function updateAuthUI() {
  const authContainer = document.getElementById('auth-container');
  const loginBtn = authContainer.querySelector('button[onclick="showAuthModal()"]');
  const signupBtn = authContainer.querySelector('button[onclick*="signup"]');
  const profileBtn = document.getElementById('profile-btn');

  if (currentUser) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'inline-block';
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (profileBtn) profileBtn.style.display = 'none';
  }
}

// Vote for a fighter
async function voteForFighter(boutId, fighterIndex) {
  console.log('VoteForFighter called:', { boutId, fighterIndex, currentUser });
  
  if (!currentUser) {
    showNotification('Please log in to vote', 'warning');
    return;
  }
  
  try {
    console.log('Checking for existing vote...');
    // Check if user has already voted for this bout
    const { data: existingVote, error: checkError } = await supabase
      .from('votes')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('bout_id', boutId)
      .single();
    
    console.log('Existing vote check result:', { existingVote, checkError });
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }
    
    if (existingVote) {
      showNotification('You have already voted for this fight', 'warning');
      return;
    }
    
    console.log('Inserting new vote...');
    // Insert the vote
    const { data, error } = await supabase
      .from('votes')
      .insert([
        {
          user_id: currentUser.id,
          bout_id: boutId,
          fighter_index: fighterIndex,
          created_at: new Date().toISOString()
        }
      ]);
    
    console.log('Vote insert result:', { data, error });
    
    if (error) {
      throw error;
    }
    
    // Refresh the voting display
    await updateVotingDisplay(boutId);
    // Vote recorded silently - no alert
    
  } catch (error) {
    console.error('Error voting:', error);
    showNotification('Error recording vote: ' + error.message, 'error');
  }
}

// Get voting results for a bout
async function getVotingResults(boutId) {
  try {
    const { data, error } = await supabase
      .from('votes')
      .select('fighter_index')
      .eq('bout_id', boutId);
    
    if (error) {
      throw error;
    }
    
    const votes = data || [];
    const fighter1Votes = votes.filter(v => v.fighter_index === 0).length;
    const fighter2Votes = votes.filter(v => v.fighter_index === 1).length;
    const totalVotes = fighter1Votes + fighter2Votes;
    
    return {
      fighter1Votes,
      fighter2Votes,
      totalVotes,
      fighter1Percentage: totalVotes > 0 ? Math.round((fighter1Votes / totalVotes) * 100) : 0,
      fighter2Percentage: totalVotes > 0 ? Math.round((fighter2Votes / totalVotes) * 100) : 0
    };
  } catch (error) {
    console.error('Error getting voting results:', error);
    return { fighter1Votes: 0, fighter2Votes: 0, totalVotes: 0, fighter1Percentage: 0, fighter2Percentage: 0 };
  }
}

// Update voting display
async function updateVotingDisplay(boutId) {
  try {
    const votingContainer = document.querySelector(`[data-bout-id="${boutId}"] .voting-container`);
    if (!votingContainer) {
      console.log('Voting container not found for bout:', boutId);
      return;
    }

    // Check if current user has voted for this bout
    let userHasVoted = false;
    if (currentUser) {
      const { data: userVote, error: userVoteError } = await supabase
        .from('votes')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('bout_id', boutId)
        .single();
      if (userVote && !userVoteError) userHasVoted = true;
    }

    const results = await getVotingResults(boutId);
    const fighter1Bar = votingContainer.querySelector('.fighter1-bar');
    const fighter2Bar = votingContainer.querySelector('.fighter2-bar');
    const voteCount = votingContainer.querySelector('.vote-count');

    console.log('Voting results for bout', boutId, ':', results, 'User voted:', userHasVoted);

    if (fighter1Bar && fighter2Bar) {
      if (userHasVoted && results.totalVotes > 0) {
        // Show percentages when user has voted
        fighter1Bar.style.width = `${results.fighter1Percentage}%`;
        fighter2Bar.style.width = `${results.fighter2Percentage}%`;
        fighter1Bar.textContent = `${results.fighter1Percentage}%`;
        fighter2Bar.textContent = `${results.fighter2Percentage}%`;
      } else {
        // Show just fighter names when user has not voted (hide percentages)
        fighter1Bar.style.width = '50%';
        fighter2Bar.style.width = '50%';
        fighter1Bar.textContent = fighter1Bar.getAttribute('data-fighter-name') || 'Fighter 1';
        fighter2Bar.textContent = fighter2Bar.getAttribute('data-fighter-name') || 'Fighter 2';
      }
    }

    if (voteCount) {
      voteCount.textContent = `${results.totalVotes} votes`;
    }
  } catch (error) {
    console.error('Error updating voting display:', error);
  }
}

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
}); 