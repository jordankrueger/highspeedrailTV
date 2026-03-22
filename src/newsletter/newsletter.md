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
      <form class="subscribe-inline-form" id="newsletter-page-form" action="https://newsletter.campaign.help/subscription/form" method="post">
        <input type="hidden" name="l" value="cf81b2b8-9980-414d-bf5f-ce8cc1d5aa84">
        <input type="email" name="email" placeholder="Your email address" required>
        <button type="submit">Subscribe</button>
      </form>
      <p class="subscribe-confirm" id="nl-page-confirm" style="display: none;">You're subscribed! Welcome aboard.</p>
    </div>

  </div>
</section>

<script>
  document.getElementById('newsletter-page-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var form = this;
    var btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Subscribing...';
    var data = new URLSearchParams(new FormData(form));
    fetch(form.action, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function() {
        form.style.display = 'none';
        document.getElementById('nl-page-confirm').style.display = 'block';
      })
      .catch(function() {
        btn.disabled = false;
        btn.textContent = 'Subscribe';
      });
  });
</script>
