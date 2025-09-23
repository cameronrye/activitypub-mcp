// Simple search functionality for Astro sites
(() => {
  // Search configuration
  const searchConfig = {
    searchInput: "#search-input",
    searchResults: "#search-results",
    searchData: "/search.json",
    maxResults: 10,
    minQueryLength: 2,
  };

  // Search data
  let searchData = [];
  let searchIndex = null;

  // DOM elements
  const searchInput = document.querySelector(searchConfig.searchInput);
  const searchResults = document.querySelector(searchConfig.searchResults);

  if (!searchInput || !searchResults) {
    return; // Exit if search elements not found
  }

  // Initialize search
  function initSearch() {
    // Load search data
    fetch(searchConfig.searchData)
      .then((response) => response.json())
      .then((data) => {
        searchData = data;
        buildSearchIndex();
      })
      .catch((error) => {
        console.warn("Search data could not be loaded:", error);
      });

    // Bind events
    searchInput.addEventListener("input", handleSearchInput);
    searchInput.addEventListener("focus", handleSearchFocus);
    document.addEventListener("click", handleDocumentClick);

    // Handle keyboard navigation
    searchInput.addEventListener("keydown", handleKeyDown);
  }

  // Build simple search index
  function buildSearchIndex() {
    searchIndex = searchData.map((item, index) => ({
      ...item,
      searchText:
        `${item.title} ${item.content} ${item.tags || ""}`.toLowerCase(),
      index: index,
    }));
  }

  // Handle search input
  function handleSearchInput(event) {
    const query = event.target.value.trim();

    if (query.length < searchConfig.minQueryLength) {
      hideResults();
      return;
    }

    performSearch(query);
  }

  // Handle search focus
  function handleSearchFocus(event) {
    const query = event.target.value.trim();
    if (query.length >= searchConfig.minQueryLength) {
      performSearch(query);
    }
  }

  // Handle document click to hide results
  function handleDocumentClick(event) {
    if (
      !searchInput.contains(event.target) &&
      !searchResults.contains(event.target)
    ) {
      hideResults();
    }
  }

  // Handle keyboard navigation
  function handleKeyDown(event) {
    const results = searchResults.querySelectorAll(".search-result");
    const activeResult = searchResults.querySelector(".search-result.active");

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (activeResult) {
          const next = activeResult.nextElementSibling;
          if (next) {
            activeResult.classList.remove("active");
            next.classList.add("active");
          }
        } else if (results.length > 0) {
          results[0].classList.add("active");
        }
        break;

      case "ArrowUp":
        event.preventDefault();
        if (activeResult) {
          const prev = activeResult.previousElementSibling;
          if (prev) {
            activeResult.classList.remove("active");
            prev.classList.add("active");
          }
        }
        break;

      case "Enter":
        event.preventDefault();
        if (activeResult) {
          const link = activeResult.querySelector("a") || activeResult;
          if (link?.href) {
            window.location.href = link.href;
          }
        }
        break;

      case "Escape":
        hideResults();
        searchInput.blur();
        break;
    }
  }

  // Perform search
  function performSearch(query) {
    if (!searchIndex) {
      return;
    }

    const queryLower = query.toLowerCase();
    const results = [];

    // Simple text matching
    for (const item of searchIndex) {
      if (item.searchText.includes(queryLower)) {
        const score = calculateScore(item, queryLower);
        results.push({ ...item, score });
      }
    }

    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);

    // Limit results
    const limitedResults = results.slice(0, searchConfig.maxResults);

    displayResults(limitedResults, query);
  }

  // Calculate search score
  function calculateScore(item, query) {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const contentLower = item.content.toLowerCase();

    // Title matches are worth more
    if (titleLower.includes(query)) {
      score += 10;
      if (titleLower.startsWith(query)) {
        score += 5;
      }
    }

    // Content matches
    if (contentLower.includes(query)) {
      score += 1;
    }

    // Exact matches are worth more
    if (titleLower === query) {
      score += 20;
    }

    return score;
  }

  // Display search results
  function displayResults(results, query) {
    if (results.length === 0) {
      searchResults.innerHTML =
        '<div class="search-result"><div class="result-title">No results found</div></div>';
    } else {
      searchResults.innerHTML = results
        .map((result) => {
          const excerpt = createExcerpt(result.content, query);
          return `
          <a href="${result.url}" class="search-result">
            <div class="result-title">${highlightQuery(result.title, query)}</div>
            <div class="result-excerpt">${excerpt}</div>
          </a>
        `;
        })
        .join("");
    }

    showResults();
  }

  // Create excerpt with highlighted query
  function createExcerpt(content, query, maxLength = 150) {
    const queryIndex = content.toLowerCase().indexOf(query.toLowerCase());

    if (queryIndex === -1) {
      return (
        content.substring(0, maxLength) +
        (content.length > maxLength ? "..." : "")
      );
    }

    const start = Math.max(0, queryIndex - 50);
    const end = Math.min(content.length, start + maxLength);
    let excerpt = content.substring(start, end);

    if (start > 0) {
      excerpt = `...${excerpt}`;
    }
    if (end < content.length) {
      excerpt = `${excerpt}...`;
    }

    return highlightQuery(excerpt, query);
  }

  // Highlight query in text
  function highlightQuery(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
  }

  // Escape regex special characters
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Show search results
  function showResults() {
    searchResults.classList.add("show");
  }

  // Hide search results
  function hideResults() {
    searchResults.classList.remove("show");
    // Remove active states
    const activeResults = searchResults.querySelectorAll(
      ".search-result.active",
    );
    for (const result of activeResults) {
      result.classList.remove("active");
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSearch);
  } else {
    initSearch();
  }
})();
