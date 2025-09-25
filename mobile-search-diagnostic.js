// Mobile Search Diagnostic Script
// Run this in the browser console on the site to check mobile search functionality

console.log('=== Mobile Search Diagnostic ===');

// Test 1: Check if HTML elements exist
console.log('\n1. Checking HTML elements:');
const mobileSearchOverlay = document.getElementById('mobile-search-overlay');
const mobileSearchInput = document.getElementById('mobile-search-input');
const mobileSearchToggle = document.querySelector('.mobile-search-toggle');
const mobileSearchClose = document.querySelector('.mobile-search-close');

console.log('✓ Mobile search overlay:', !!mobileSearchOverlay);
console.log('✓ Mobile search input:', !!mobileSearchInput);
console.log('✓ Mobile search toggle:', !!mobileSearchToggle);
console.log('✓ Mobile search close button:', !!mobileSearchClose);

// Test 2: Check if global functions are available
console.log('\n2. Checking global functions:');
console.log('✓ window.showMobileSearch:', typeof window.showMobileSearch);
console.log('✓ window.hideMobileSearch:', typeof window.hideMobileSearch);

// Test 3: Check CSS classes and styles
console.log('\n3. Checking CSS:');
if (mobileSearchOverlay) {
    const overlayStyles = window.getComputedStyle(mobileSearchOverlay);
    console.log('✓ Overlay position:', overlayStyles.position);
    console.log('✓ Overlay z-index:', overlayStyles.zIndex);
    console.log('✓ Overlay visibility:', overlayStyles.visibility);
    console.log('✓ Overlay opacity:', overlayStyles.opacity);
}

// Test 4: Check if mobile search toggle is visible on mobile
console.log('\n4. Checking mobile visibility:');
if (mobileSearchToggle) {
    const toggleStyles = window.getComputedStyle(mobileSearchToggle);
    console.log('✓ Toggle display:', toggleStyles.display);
    console.log('✓ Toggle visibility:', toggleStyles.visibility);
}

// Test 5: Test mobile search functionality
console.log('\n5. Testing mobile search functionality:');

function testMobileSearchShow() {
    console.log('Testing showMobileSearch...');
    if (window.showMobileSearch) {
        window.showMobileSearch();
        setTimeout(() => {
            const isVisible = mobileSearchOverlay && mobileSearchOverlay.classList.contains('show');
            console.log('✓ Mobile search overlay visible:', isVisible);
            if (isVisible) {
                console.log('✅ showMobileSearch works correctly!');
            } else {
                console.log('❌ showMobileSearch failed - overlay not visible');
            }
        }, 200);
    } else {
        console.log('❌ window.showMobileSearch not available');
    }
}

function testMobileSearchHide() {
    console.log('Testing hideMobileSearch...');
    if (window.hideMobileSearch) {
        window.hideMobileSearch();
        setTimeout(() => {
            const isHidden = mobileSearchOverlay && !mobileSearchOverlay.classList.contains('show');
            console.log('✓ Mobile search overlay hidden:', isHidden);
            if (isHidden) {
                console.log('✅ hideMobileSearch works correctly!');
            } else {
                console.log('❌ hideMobileSearch failed - overlay still visible');
            }
        }, 200);
    } else {
        console.log('❌ window.hideMobileSearch not available');
    }
}

function testMobileSearchToggleButton() {
    console.log('Testing mobile search toggle button...');
    if (mobileSearchToggle) {
        mobileSearchToggle.click();
        setTimeout(() => {
            const isVisible = mobileSearchOverlay && mobileSearchOverlay.classList.contains('show');
            console.log('✓ Toggle button click result:', isVisible);
            if (isVisible) {
                console.log('✅ Mobile search toggle button works!');
                // Close it
                setTimeout(() => {
                    if (window.hideMobileSearch) {
                        window.hideMobileSearch();
                    }
                }, 1000);
            } else {
                console.log('❌ Mobile search toggle button failed');
            }
        }, 200);
    } else {
        console.log('❌ Mobile search toggle button not found');
    }
}

// Run tests
testMobileSearchShow();
setTimeout(() => {
    testMobileSearchHide();
    setTimeout(() => {
        testMobileSearchToggleButton();
    }, 1000);
}, 1000);

// Test 6: Check for JavaScript errors
console.log('\n6. Checking for JavaScript errors:');
const originalError = console.error;
let errorCount = 0;
console.error = function(...args) {
    errorCount++;
    originalError.apply(console, args);
};

setTimeout(() => {
    console.log('✓ JavaScript errors detected:', errorCount);
    console.error = originalError;
}, 5000);

console.log('\n=== Diagnostic Complete ===');
console.log('If all tests pass, mobile search should be working correctly.');
console.log('If any tests fail, check the console for specific error messages.');
