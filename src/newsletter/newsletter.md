---
layout: layouts/base.njk
title: Newsletter
permalink: /newsletter/
---

<section class="newsletter-hero">
  <div class="container">
    <h1>This Week in <span class="accent">High Speed Rail</span></h1>
    <p>A weekly roundup of HSR news from around the world, plus curated videos from our library. Free, no spam.</p>
  </div>
</section>

<section class="newsletter-list">
  <div class="container">
    <div class="newsletter-issues">
      <a href="/newsletter/issue-001/" class="newsletter-issue-card">
        <span class="newsletter-issue-number">Issue #1</span>
        <span class="newsletter-issue-date">March 22, 2026</span>
        <span class="newsletter-issue-desc">China's CR450 hits 896 km/h, Austria's Koralmbahn opens, California completes 59th structure, Brightline West stalls, and more.</span>
      </a>
    </div>

    <div class="newsletter-subscribe-cta">
      <h2>Get it in your inbox</h2>
      <form class="subscribe-inline-form" id="newsletter-page-form" action="https://progressives-signup.restless-salad-a31e.workers.dev" method="post">
        <input type="email" name="email" placeholder="Your email address" required>
        <button type="submit">Subscribe</button>
      </form>
      <p class="subscribe-confirm" id="nl-page-confirm" style="display: none;">You're subscribed! Welcome aboard.</p>
      <p class="subscribe-error" id="nl-page-error" style="display: none; color: #c0392b; margin-top: 0.5rem;"></p>
    </div>

  </div>
</section>

<script>
  document.getElementById('newsletter-page-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var form = this;
    var btn = form.querySelector('button');
    var confirmEl = document.getElementById('nl-page-confirm');
    var errorEl = document.getElementById('nl-page-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Subscribing...';
    var email = form.querySelector('input[name="email"]').value;
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, list: 'hsr-tv' })
    })
      .then(function(r) { return r.json().catch(function() { return {}; }).then(function(b) { return { ok: r.ok, body: b }; }); })
      .then(function(res) {
        if (res.ok && res.body.success) {
          form.style.display = 'none';
          confirmEl.style.display = 'block';
        } else {
          errorEl.textContent = (res.body && res.body.error) || 'Something went wrong. Please try again.';
          errorEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Subscribe';
        }
      })
      .catch(function() {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Subscribe';
      });
  });
</script>
