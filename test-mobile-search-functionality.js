// Test script to verify mobile search functionality
// Run this in the browser console on the mobile-search-test.html page

console.log('=== Mobile Search Functionality Test ===');

// Test 1: Check if global functions exist
console.log('\n1. Testing global function availability:');
console.log('window.showMobileSearch:', typeof window.showMobileSearch);
console.log('window.hideMobileSearch:', typeof window.hideMobileSearch);

// Test 2: Check if HTML elements exist
console.log('\n2. Testing HTML elements:');
const overlay = document.getElementById('mobile-search-overlay');
const input = document.getElementById('mobile-search-input');
const closeBtn = document.querySelector('.mobile-search-close');

console.log('mobile-search-overlay exists:', !!overlay);
console.log('mobile-search-input exists:', !!input);
console.log('mobile-search-close button exists:', !!closeBtn);

// Test 3: Test showing mobile search
console.log('\n3. Testing showMobileSearch function:');
if (window.showMobileSearch) {
    console.log('Calling window.showMobileSearch()...');
    window.showMobileSearch();
    
    setTimeout(() => {
        const isVisible = overlay && overlay.classList.contains('show');
        console.log('Mobile search overlay is visible:', isVisible);
        
        // Test 4: Test hiding mobile search
        console.log('\n4. Testing hideMobileSearch function:');
        if (window.hideMobileSearch) {
            console.log('Calling window.hideMobileSearch()...');
            window.hideMobileSearch();
            
            setTimeout(() => {
                const isHidden = overlay && !overlay.classList.contains('show');
                console.log('Mobile search overlay is hidden:', isHidden);
                
                console.log('\n=== Test Complete ===');
                if (isVisible && isHidden) {
                    console.log('✅ All tests passed! Mobile search functionality is working correctly.');
                } else {
                    console.log('❌ Some tests failed. Check the implementation.');
                }
            }, 500);
        }
    }, 500);
} else {
    console.log('❌ window.showMobileSearch function not available');
}

// Test 5: Test close button functionality
console.log('\n5. Testing close button:');
if (closeBtn) {
    console.log('Close button found, testing click event...');
    // Show the overlay first
    if (window.showMobileSearch) {
        window.showMobileSearch();
        setTimeout(() => {
            closeBtn.click();
            setTimeout(() => {
                const isHidden = overlay && !overlay.classList.contains('show');
                console.log('Close button works:', isHidden);
            }, 300);
        }, 300);
    }
}

// Test 6: Test escape key functionality
console.log('\n6. Testing escape key:');
if (window.showMobileSearch) {
    setTimeout(() => {
        window.showMobileSearch();
        setTimeout(() => {
            // Simulate escape key press
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(escapeEvent);
            setTimeout(() => {
                const isHidden = overlay && !overlay.classList.contains('show');
                console.log('Escape key works:', isHidden);
            }, 300);
        }, 300);
    }, 2000);
}
