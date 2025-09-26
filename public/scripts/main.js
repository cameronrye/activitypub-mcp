// Main JavaScript for ActivityPub MCP site
(() => {
  // Mobile navigation toggle
  function initMobileNav() {
    const toggle = document.querySelector(".navbar-toggle");
    const nav = document.querySelector(".navbar-nav");

    if (!toggle || !nav) return;

    // Initialize aria-expanded attribute
    toggle.setAttribute("aria-expanded", "false");

    toggle.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent event bubbling

      const isExpanded = nav.classList.contains("show");

      if (isExpanded) {
        nav.classList.remove("show");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
      } else {
        nav.classList.add("show");
        toggle.classList.add("active");
        toggle.setAttribute("aria-expanded", "true");
        // Close mobile search if it's open
        if (window.hideMobileSearch) {
          window.hideMobileSearch();
        }
      }
    });

    // Close mobile nav when clicking outside
    document.addEventListener("click", (event) => {
      const isClickInsideNav = nav.contains(event.target);
      const isClickOnToggle = toggle.contains(event.target);
      const isNavVisible = nav.classList.contains("show");

      if (isNavVisible && !isClickInsideNav && !isClickOnToggle) {
        nav.classList.remove("show");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    // Close mobile nav on escape key
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("show")) {
        nav.classList.remove("show");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus(); // Return focus to toggle button for accessibility
      }
    });

    // Close mobile nav when clicking on navigation links
    const navLinks = nav.querySelectorAll(".nav-link");
    for (const link of navLinks) {
      link.addEventListener("click", () => {
        if (nav.classList.contains("show")) {
          nav.classList.remove("show");
          toggle.classList.remove("active");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    // Close mobile nav when resizing to desktop view
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768 && nav.classList.contains("show")) {
        nav.classList.remove("show");
        toggle.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Mobile search toggle
  function initMobileSearch() {
    const searchToggle = document.querySelector(".mobile-search-toggle");

    if (!searchToggle) return;

    // Initialize aria-expanded attribute
    searchToggle.setAttribute("aria-expanded", "false");

    searchToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      // Close mobile nav if it's open
      const nav = document.querySelector(".navbar-nav");
      const navToggle = document.querySelector(".navbar-toggle");
      if (nav?.classList.contains("show")) {
        nav.classList.remove("show");
        if (navToggle) {
          navToggle.classList.remove("active");
          navToggle.setAttribute("aria-expanded", "false");
        }
      }

      // Use the global mobile search function from Search.astro
      if (window.showMobileSearch) {
        window.showMobileSearch();
      } else {
        // Fallback to direct approach if Search.astro hasn't loaded yet
        showMobileSearchOverlay();
      }
    });

    // Direct mobile search overlay control
    function showMobileSearchOverlay() {
      const mobileSearchOverlay = document.getElementById("mobile-search-overlay");

      if (mobileSearchOverlay) {
        mobileSearchOverlay.classList.add("show");
        searchToggle.setAttribute("aria-expanded", "true");

        // Focus the search input
        const mobileSearchInput = document.getElementById("mobile-search-input");
        if (mobileSearchInput) {
          setTimeout(() => mobileSearchInput.focus(), 150);
        }

        // Set up close functionality if not already set
        const closeButton = mobileSearchOverlay.querySelector(".mobile-search-close");
        if (closeButton && !closeButton.hasAttribute("data-close-handler")) {
          closeButton.setAttribute("data-close-handler", "true");
          closeButton.addEventListener("click", hideMobileSearchOverlay);
        }

        // Close on overlay click if not already set
        if (!mobileSearchOverlay.hasAttribute("data-overlay-handler")) {
          mobileSearchOverlay.setAttribute("data-overlay-handler", "true");
          mobileSearchOverlay.addEventListener("click", (e) => {
            if (e.target === mobileSearchOverlay) {
              hideMobileSearchOverlay();
            }
          });
        }
      }
    }

    function hideMobileSearchOverlay() {
      const mobileSearchOverlay = document.getElementById("mobile-search-overlay");
      if (mobileSearchOverlay) {
        mobileSearchOverlay.classList.remove("show");
        searchToggle.setAttribute("aria-expanded", "false");

        // Clear the search input
        const mobileSearchInput = document.getElementById("mobile-search-input");
        if (mobileSearchInput) {
          mobileSearchInput.value = "";
        }
      }
    }

    // Close mobile search on escape key
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const mobileSearchOverlay = document.getElementById("mobile-search-overlay");
        if (mobileSearchOverlay?.classList.contains("show")) {
          hideMobileSearchOverlay();
          searchToggle.focus(); // Return focus to toggle button for accessibility
        }
      }
    });

    // Close mobile search when resizing to desktop view
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768) {
        const mobileSearchOverlay = document.getElementById("mobile-search-overlay");
        if (mobileSearchOverlay?.classList.contains("show")) {
          hideMobileSearchOverlay();
        }
      }
    });

    // Make hideMobileSearchOverlay available for escape and resize handlers
  }

  // Smooth scrolling for anchor links
  function initSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');

    for (const link of links) {
      link.addEventListener("click", function (event) {
        const href = this.getAttribute("href");

        // Skip if it's just "#"
        if (href === "#") return;

        const target = document.querySelector(href);
        if (target) {
          event.preventDefault();

          const headerHeight = document.querySelector(".site-header")?.offsetHeight || 0;
          const targetPosition = target.offsetTop - headerHeight - 20;

          window.scrollTo({
            top: targetPosition,
            behavior: "smooth",
          });

          // Update URL without triggering scroll
          history.pushState(null, null, href);
        }
      });
    }
  }

  // Tab functionality for installation instructions
  function initTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabPanes = document.querySelectorAll(".tab-pane");

    if (tabButtons.length === 0) return;

    for (const button of tabButtons) {
      button.addEventListener("click", function () {
        const targetTab = this.getAttribute("data-tab");

        // Remove active class from all buttons and panes
        for (const btn of tabButtons) {
          btn.classList.remove("active");
        }
        for (const pane of tabPanes) {
          pane.classList.remove("active");
        }

        // Add active class to clicked button and corresponding pane
        this.classList.add("active");
        const targetPane = document.getElementById(targetTab);
        if (targetPane) {
          targetPane.classList.add("active");
        }
      });
    }
  }

  // Copy code functionality
  function initCodeCopy() {
    const codeBlocks = document.querySelectorAll("pre code");

    for (const codeBlock of codeBlocks) {
      const pre = codeBlock.parentElement;

      // Enhanced check for existing copy buttons - check both pre and parent container
      if (pre.querySelector(".copy-button") || pre.parentElement?.querySelector(".copy-button")) {
        continue;
      }

      // Also check if this pre element already has a data attribute to mark it as processed
      if (pre.hasAttribute("data-copy-button-added")) {
        continue;
      }

      // Create copy button
      const copyButton = document.createElement("button");
      copyButton.className = "copy-button";
      copyButton.innerHTML = "Copy";
      copyButton.setAttribute("aria-label", "Copy code to clipboard");

      // Add copy button to pre element
      pre.style.position = "relative";
      pre.appendChild(copyButton);

      // Mark this pre element as processed
      pre.setAttribute("data-copy-button-added", "true");

      copyButton.addEventListener("click", async function () {
        try {
          await navigator.clipboard.writeText(codeBlock.textContent);

          // Visual feedback
          this.innerHTML = "Copied!";
          this.classList.add("copied");

          setTimeout(() => {
            this.innerHTML = "Copy";
            this.classList.remove("copied");
          }, 2000);
        } catch (err) {
          console.error("Failed to copy code:", err);

          // Fallback for older browsers
          const textArea = document.createElement("textarea");
          textArea.value = codeBlock.textContent;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);

          this.innerHTML = "Copied!";
          setTimeout(() => {
            this.innerHTML = "Copy";
          }, 2000);
        }
      });
    }
  }

  // Scroll to top functionality - REMOVED
  // function initScrollToTop() {
  //   // This functionality has been removed per user request
  // }

  // Theme toggle (if needed in the future)
  function initThemeToggle() {
    // Placeholder for theme toggle functionality
    // Can be implemented later if dark mode toggle is needed
  }

  // Initialize all functionality
  function init() {
    initMobileNav();
    initMobileSearch();
    initSmoothScrolling();
    initTabs();
    initCodeCopy();
    // initScrollToTop(); // Removed per user request
    initThemeToggle();

    // Debug: Log initialization completion
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
