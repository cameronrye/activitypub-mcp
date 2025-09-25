// Debug Mobile Search - Run this in browser console
console.log('=== Mobile Search Debug ===');

// 1. Check if overlay element exists
const overlay = document.getElementById('mobile-search-overlay');
console.log('1. Mobile search overlay element:', overlay);

if (overlay) {
    console.log('   - Overlay classes:', overlay.className);
    console.log('   - Overlay computed display:', window.getComputedStyle(overlay).display);
    console.log('   - Overlay computed visibility:', window.getComputedStyle(overlay).visibility);
    console.log('   - Overlay computed opacity:', window.getComputedStyle(overlay).opacity);
    console.log('   - Overlay computed position:', window.getComputedStyle(overlay).position);
    console.log('   - Overlay computed z-index:', window.getComputedStyle(overlay).zIndex);
    console.log('   - Overlay computed transform:', window.getComputedStyle(overlay).transform);
    
    // Check container
    const container = overlay.querySelector('.mobile-search-container');
    if (container) {
        console.log('   - Container transform:', window.getComputedStyle(container).transform);
    }
} else {
    console.log('   ❌ Mobile search overlay element NOT FOUND');
}

// 2. Check if input exists
const input = document.getElementById('mobile-search-input');
console.log('2. Mobile search input:', !!input);

// 3. Check if toggle button exists
const toggle = document.querySelector('.mobile-search-toggle');
console.log('3. Mobile search toggle:', !!toggle);

// 4. Test adding show class manually
if (overlay) {
    console.log('4. Testing manual show class...');
    overlay.classList.add('show');
    
    setTimeout(() => {
        console.log('   - After adding show class:');
        console.log('   - Display:', window.getComputedStyle(overlay).display);
        console.log('   - Visibility:', window.getComputedStyle(overlay).visibility);
        console.log('   - Opacity:', window.getComputedStyle(overlay).opacity);
        
        const container = overlay.querySelector('.mobile-search-container');
        if (container) {
            console.log('   - Container transform:', window.getComputedStyle(container).transform);
        }
        
        // Remove show class after test
        setTimeout(() => {
            overlay.classList.remove('show');
            console.log('   - Show class removed');
        }, 2000);
    }, 100);
}

// 5. Check CSS rules
console.log('5. Checking CSS rules...');
const styles = window.getComputedStyle(overlay);
console.log('   - All CSS rules applied to overlay:');
for (let i = 0; i < styles.length; i++) {
    const prop = styles[i];
    if (prop.includes('display') || prop.includes('visibility') || prop.includes('opacity') || prop.includes('position') || prop.includes('z-index')) {
        console.log(`   - ${prop}: ${styles.getPropertyValue(prop)}`);
    }
}

// 6. Check for conflicting CSS
console.log('6. Checking for conflicting CSS...');
const allStyleSheets = Array.from(document.styleSheets);
console.log('   - Number of stylesheets:', allStyleSheets.length);

// 7. Force show overlay for testing
console.log('7. Force showing overlay with inline styles...');
if (overlay) {
    overlay.style.display = 'flex';
    overlay.style.visibility = 'visible';
    overlay.style.opacity = '1';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = '9999';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    
    console.log('   - Overlay forced to show with inline styles');
    console.log('   - Check if you can see it now!');
    
    setTimeout(() => {
        overlay.style.cssText = '';
        console.log('   - Inline styles removed');
    }, 5000);
}

console.log('=== Debug Complete ===');
