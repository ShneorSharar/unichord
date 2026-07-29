/**
 * Infinite Scroll for Achord Archive Pages.
 */
jQuery(document).ready(function($) {
    const container = $('.archive-posts-container');
    const loadMoreBtn = $('<button id="achord-load-more" class="achord-button">טען עוד</button>');
    let loading = false;

    // Append the load more button to the container.
    container.after(loadMoreBtn);

    // Event listener for the "Load More" button.
    loadMoreBtn.on('click', function() {
        if (loading) return;

        loading = true;
        const button = $(this);
        const paged = container.data('current-page');
        const postType = container.data('post-type');

        button.text('טוען...');

        $.ajax({
            url: AchordAjax.ajaxurl,
            type: 'post',
            data: {
                action: 'achord_load_more_posts',
                nonce: AchordAjax.nonce,
                paged: paged,
                post_type: postType,
            },
            success: function(response) {
                if (response) {
                    // parseHTML עם keepScripts=false מסיר תגי <script> מהתגובה לפני ההזרקה
                    container.append($.parseHTML(response, document, false));
                    container.data('current-page', paged + 1);
                    button.text('טען עוד');
                } else {
                    button.text('נגמר');
                    button.prop('disabled', true);
                }
            },
            error: function() {
                // כשל רשת/שרת — להחזיר את הכפתור למצב שמיש במקום להשאירו תקוע על "טוען..."
                button.text('טען עוד');
                button.prop('disabled', false);
            },
            complete: function() {
                loading = false;
            }
        });
    });
});