module.exports = function(eleventyConfig) {
  // Pass through CSS to output directory
  eleventyConfig.addPassthroughCopy({"src/css": "css"});

  // Add date filter for formatting
  eleventyConfig.addFilter("dateFormat", (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  });

  // Filter videos by category
  eleventyConfig.addFilter("filterByCategory", (videos, category) => {
    return videos.filter(v => v.category === category);
  });

  // Get featured video
  eleventyConfig.addFilter("getFeatured", (videos) => {
    return videos.find(v => v.featured) || videos[0];
  });

  // Get recent videos (excluding featured)
  eleventyConfig.addFilter("getRecent", (videos, count = 8) => {
    const featured = videos.find(v => v.featured);
    return videos
      .filter(v => !v.featured)
      .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
      .slice(0, count);
  });

  // Get unique categories from videos
  eleventyConfig.addFilter("getCategories", (videos) => {
    const categories = [...new Set(videos.map(v => v.category))];
    return categories.map(slug => ({
      slug,
      name: slug.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }));
  });

  // Format category slug to readable name
  eleventyConfig.addFilter("categoryName", (slug) => {
    return slug.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  });

  // Create collection for category pages
  eleventyConfig.addCollection("categories", function(collectionApi) {
    const videos = require('./src/_data/videos.json');
    const categorySet = new Set(videos.map(v => v.category));
    return [...categorySet].map(slug => ({
      slug,
      name: slug.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' '),
      videos: videos.filter(v => v.category === slug)
        .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
    }));
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
