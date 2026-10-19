<?php
/**
 * Plugin Name: uc-contact-form
 * Description: טופס יצירת קשר של unichord ([uc_contact_form]) + שמירת כל פנייה כ-CPT פרטי (uc_contact_msg, "פניות").
 * Version:     1.0.0
 *
 * עצמאי לחלוטין. הסרה = מחיקת הקובץ (והחזרת page-contact.php לגרסה ללא ה-shortcode).
 * הפניות השמורות נשארות ב-DB כ-post_type=uc_contact_msg (מחיקה: wp post delete $(wp post list --post_type=uc_contact_msg --post_status=any --format=ids) --force).
 *
 * פרטיות: כתובת היעד קיימת רק כאן בצד-השרת (UC_CONTACT_TO) ולעולם לא מודפסת לעמוד.
 *         IP לא נשמר. נשמר רק HMAC שלו (לצורך הגבלת קצב).
 * הגנות: nonce · honeypot · זמן-מילוי חתום (≥3 שניות) · 5 פניות לשעה לכל IP · ניקוי CR/LF מכל מה שנכנס לכותרות.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

if ( ! defined( 'UC_CONTACT_TO' ) ) {
	define( 'UC_CONTACT_TO', 'contact@example.com' ); // override in wp-config.php
}

const UCF_ACTION    = 'ucf_send';
const UCF_CPT       = 'uc_contact_msg';
const UCF_MIN_SECS  = 3;
const UCF_MAX_AGE   = DAY_IN_SECONDS;
const UCF_RL_MAX    = 5;
const UCF_RL_WINDOW = HOUR_IN_SECONDS;
const UCF_MSG_MIN   = 10;
const UCF_MSG_MAX   = 5000;

/** נושאים: מפתח (ל-URL) → תווית. */
function ucf_subjects() {
	return array(
		'general'   => 'שאלה כללית',
		'bug'       => 'דיווח על טעות באתר',
		'copyright' => 'בקשת הסרה (זכויות יוצרים)',
		'other'     => 'אחר',
	);
}

/** הודעות למשתמש (מפתח שגיאה → טקסט). */
function ucf_messages() {
	return array(
		'sent'      => 'תודה! ההודעה נשלחה. בדרך כלל אנחנו עונים תוך כ-48 שעות.',
		'expired'   => 'תוקף הטופס פג. רעננו את העמוד ונסו שוב.',
		'fast'      => 'השליחה הייתה מהירה מדי. המתינו כמה שניות ונסו שוב.',
		'rate'      => 'נשלחו יותר מדי הודעות בזמן קצר. נסו שוב בעוד שעה.',
		'msg_short' => 'נא לכתוב הודעה של ' . UCF_MSG_MIN . ' תווים לפחות.',
		'msg_long'  => 'ההודעה ארוכה מדי (עד ' . UCF_MSG_MAX . ' תווים).',
		'email_bad' => 'כתובת האימייל לא נראית תקינה. תקנו אותה או השאירו את השדה ריק.',
		'server'    => 'אירעה תקלה ולא הצלחנו לקבל את ההודעה. נסו שוב מאוחר יותר.',
	);
}

/** HMAC של ה-IP (לא שומרים IP גולמי). */
function ucf_ip_hash() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
	return substr( hash_hmac( 'sha256', $ip, wp_salt( 'auth' ) ), 0, 32 );
}

function ucf_sign( $ts ) {
	return substr( hash_hmac( 'sha256', 'ucf|' . $ts, wp_salt( 'nonce' ) ), 0, 32 );
}

/** מסיר CR/LF ותווי בקרה (לכל דבר שעלול להגיע לכותרת מייל). */
function ucf_one_line( $s ) {
	return trim( preg_replace( '/[\x00-\x1F\x7F]+/u', ' ', (string) $s ) );
}

/** כתובת עמוד-מקור: רק מהאתר עצמו (נתיב יחסי או אותו host). */
function ucf_clean_page_url( $raw ) {
	$raw = trim( (string) $raw );
	if ( '' === $raw || strlen( $raw ) > 500 ) { return ''; }
	if ( '/' === $raw[0] && ( ! isset( $raw[1] ) || '/' !== $raw[1] ) ) {
		$raw = home_url( $raw );
	}
	$url = esc_url_raw( $raw, array( 'http', 'https' ) );
	if ( ! $url ) { return ''; }
	$host = wp_parse_url( $url, PHP_URL_HOST );
	if ( ! $host || strtolower( $host ) !== strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) ) ) {
		return '';
	}
	return $url;
}

/* ─────────────────────────── CPT "פניות" ─────────────────────────── */

add_action( 'init', function () {
	$cap = 'manage_options';
	register_post_type( UCF_CPT, array(
		'labels'              => array(
			'name'          => 'פניות',
			'singular_name' => 'פנייה',
			'menu_name'     => 'פניות',
			'all_items'     => 'כל הפניות',
			'edit_item'     => 'פנייה',
			'search_items'  => 'חיפוש פניות',
			'not_found'     => 'אין פניות',
		),
		'public'              => false,
		'publicly_queryable'  => false,
		'exclude_from_search' => true,
		'show_ui'             => true,
		'show_in_menu'        => true,
		'show_in_nav_menus'   => false,
		'show_in_admin_bar'   => false,
		'show_in_rest'        => false,
		'query_var'           => false,
		'rewrite'             => false,
		'has_archive'         => false,
		'menu_icon'           => 'dashicons-email-alt',
		'menu_position'       => 26,
		'supports'            => array( 'title' ),
		'map_meta_cap'        => false,
		'capabilities'        => array(
			'edit_post'              => $cap,
			'read_post'              => $cap,
			'delete_post'            => $cap,
			'edit_posts'             => $cap,
			'edit_others_posts'      => $cap,
			'edit_private_posts'     => $cap,
			'edit_published_posts'   => $cap,
			'delete_posts'           => $cap,
			'delete_others_posts'    => $cap,
			'delete_private_posts'   => $cap,
			'delete_published_posts' => $cap,
			'publish_posts'          => $cap,
			'read_private_posts'     => $cap,
			'create_posts'           => 'do_not_allow',
		),
	) );
} );

/* עמודות ברשימת הפניות */
add_filter( 'manage_' . UCF_CPT . '_posts_columns', function ( $cols ) {
	return array(
		'cb'         => isset( $cols['cb'] ) ? $cols['cb'] : '',
		'title'      => 'פנייה',
		'ucf_email'  => 'אימייל לתשובה',
		'ucf_page'   => 'עמוד',
		'ucf_mail'   => 'מייל נשלח?',
		'date'       => 'תאריך',
	);
} );
add_action( 'manage_' . UCF_CPT . '_posts_custom_column', function ( $col, $post_id ) {
	if ( 'ucf_email' === $col ) {
		$e = get_post_meta( $post_id, '_ucf_email', true );
		echo $e ? '<a href="mailto:' . esc_attr( $e ) . '">' . esc_html( $e ) . '</a>' : '—';
	} elseif ( 'ucf_page' === $col ) {
		$p = get_post_meta( $post_id, '_ucf_page', true );
		echo $p ? '<a href="' . esc_url( $p ) . '" target="_blank" rel="noopener">' . esc_html( wp_parse_url( $p, PHP_URL_PATH ) ?: $p ) . '</a>' : '—';
	} elseif ( 'ucf_mail' === $col ) {
		echo get_post_meta( $post_id, '_ucf_mail_sent', true ) ? 'כן' : '<strong style="color:#b32d2e">לא</strong>';
	}
}, 10, 2 );

/* תיבת תצוגה (קריאה בלבד) במסך הפנייה */
add_action( 'add_meta_boxes_' . UCF_CPT, function () {
	add_meta_box( 'ucf_details', 'פרטי הפנייה', function ( $post ) {
		$subjects = ucf_subjects();
		$sk   = get_post_meta( $post->ID, '_ucf_subject', true );
		$uid  = (int) get_post_meta( $post->ID, '_ucf_user_id', true );
		$rows = array(
			'נושא'          => isset( $subjects[ $sk ] ) ? $subjects[ $sk ] : $sk,
			'שם'            => get_post_meta( $post->ID, '_ucf_name', true ),
			'אימייל לתשובה' => get_post_meta( $post->ID, '_ucf_email', true ),
			'עמוד'          => get_post_meta( $post->ID, '_ucf_page', true ),
			'משתמש מחובר'   => $uid ? '#' . $uid : 'לא',
			'מייל נשלח'     => get_post_meta( $post->ID, '_ucf_mail_sent', true ) ? 'כן' : 'לא',
			'זמן'           => get_the_date( 'Y-m-d H:i', $post ),
		);
		echo '<table class="widefat striped"><tbody>';
		foreach ( $rows as $k => $v ) {
			echo '<tr><th style="width:9em">' . esc_html( $k ) . '</th><td>' . esc_html( '' === (string) $v ? '—' : $v ) . '</td></tr>';
		}
		echo '</tbody></table>';
		echo '<h3>ההודעה</h3><div style="white-space:pre-wrap;background:#fff;border:1px solid #ccd0d4;padding:12px;max-height:480px;overflow:auto">'
			. esc_html( get_post_meta( $post->ID, '_ucf_message', true ) ) . '</div>';
	}, UCF_CPT, 'normal', 'high' );
} );

/* ─────────────────────────── shortcode ─────────────────────────── */

function ucf_shortcode() {
	$subjects = ucf_subjects();
	$msgs     = ucf_messages();

	$pre = isset( $_GET['subject'] ) ? sanitize_key( wp_unslash( $_GET['subject'] ) ) : '';
	if ( ! isset( $subjects[ $pre ] ) ) { $pre = 'general'; }

	// עמוד-מקור: ?from= (אותו אתר בלבד). הערה: ?page= שמור בוורדפרס ומפנה 301, לכן לא בשימוש.
	$from = isset( $_GET['from'] ) ? ucf_clean_page_url( wp_unslash( $_GET['from'] ) ) : '';

	// ערכים ישנים אחרי שגיאה בשליחה ללא JS (נשמרים 5 דק' לפי ה-HMAC של ה-IP).
	$old = array();
	$err = isset( $_GET['ucf_err'] ) ? sanitize_key( wp_unslash( $_GET['ucf_err'] ) ) : '';
	if ( $err && isset( $msgs[ $err ] ) ) {
		$k   = 'ucf_old_' . ucf_ip_hash();
		$old = get_transient( $k );
		if ( $old ) { delete_transient( $k ); } else { $old = array(); }
		if ( ! empty( $old['subject'] ) && isset( $subjects[ $old['subject'] ] ) ) { $pre = $old['subject']; }
		if ( ! empty( $old['page'] ) ) { $from = ucf_clean_page_url( $old['page'] ); }
	} else {
		$err = '';
	}
	$sent = isset( $_GET['sent'] ) && '1' === $_GET['sent'];
	$o    = function ( $f ) use ( $old ) { return isset( $old[ $f ] ) ? (string) $old[ $f ] : ''; };

	$ts  = time();
	$tsh = ucf_sign( $ts );

	static $css_done = false;
	ob_start();
	if ( ! $css_done ) {
		$css_done = true;
		?>
<style id="ucf-css">
.ucf{margin:40px 0;padding:clamp(18px,4vw,32px);max-width:640px;background:var(--uc-paper-hi,#FCF8F1);border:1px solid var(--uc-border,#DED4C2);border-radius:var(--uc-r-lg,20px);box-shadow:var(--uc-shadow-sm,none);color:var(--uc-ink,#1F1810);box-sizing:border-box}
.ucf *,.ucf *::before,.ucf *::after{box-sizing:border-box}
.uc-prose .ucf>h2,.ucf>h2{margin-top:0}
.ucf__lead{margin:0 0 18px;color:var(--uc-ink-soft,#6B5D49);font-size:1rem;line-height:1.6}
.ucf__form{display:flex;flex-direction:column;gap:18px;margin:0}
.ucf__field{display:flex;flex-direction:column;gap:6px;margin:0}
.ucf__field label{font-weight:700;font-size:1rem;color:var(--uc-ink,#1F1810);margin:0}
.ucf__opt{font-weight:400;color:var(--uc-ink-soft,#6B5D49);font-size:.9rem}
.ucf__req{color:var(--uc-terracotta,#9E482D)}
.ucf__field input,.ucf__field select,.ucf__field textarea{width:100%;max-width:100%;min-height:48px;margin:0;padding:11px 14px;font:inherit;font-size:max(16px,1rem);line-height:1.5;color:var(--uc-ink,#1F1810);background:var(--uc-white,#fff);border:1.5px solid var(--uc-border-strong,#C9BBA2);border-radius:var(--uc-r-sm,8px);transition:border-color .15s,box-shadow .15s}
.ucf__field select{cursor:pointer}
.ucf__field textarea{min-height:150px;resize:vertical}
.ucf__field input[type=email]{direction:ltr;text-align:right}
.ucf__field input:focus-visible,.ucf__field select:focus-visible,.ucf__field textarea:focus-visible{outline:2px solid var(--uc-gold,#A26E3A);outline-offset:1px;border-color:var(--uc-gold,#A26E3A);box-shadow:0 0 0 3px var(--uc-gold-tint,#F0E6D8)}
.ucf__help{margin:0;font-size:.9rem;line-height:1.5;color:var(--uc-ink-soft,#6B5D49)}
.ucf__hint{margin:2px 0 0;padding:8px 12px;font-size:.95rem;line-height:1.5;color:var(--uc-ink,#1F1810);background:var(--uc-gold-tint,#F0E6D8);border-radius:var(--uc-r-sm,8px)}
.ucf__hint[hidden]{display:none}
.ucf__submit.uc-btn,.ucf__submit{align-self:flex-start;min-height:48px;min-width:44px;padding-inline:26px;font-size:max(16px,1rem);cursor:pointer}
.ucf .ucf__submit,.ucf .ucf__submit:hover,.ucf .ucf__submit:focus{background:var(--uc-gold-deep,#8A5C30);color:#fff;border:0}
body.dark-mode .ucf .ucf__submit,body.dark-mode .ucf .ucf__submit:hover,body.dark-mode .ucf .ucf__submit:focus{color:#1a2330}
.ucf .ucf__submit:focus-visible{outline:3px solid var(--uc-ink,#1F1810);outline-offset:2px}
.ucf__submit[disabled]{opacity:.7;cursor:progress}
.ucf__note{margin:0;font-size:.88rem;line-height:1.5;color:var(--uc-ink-soft,#6B5D49)}
.ucf__status:empty{display:none}
.ucf__status{margin:0 0 18px;padding:13px 16px;border-radius:var(--uc-r-md,14px);font-size:1rem;line-height:1.55;color:var(--uc-ink,#1F1810)}
.ucf__status--ok{background:var(--uc-gold-tint,#F0E6D8);border:1px solid var(--uc-border-strong,#C9BBA2)}
.ucf__status--err{background:var(--uc-terracotta-soft,#F0DACF);border:1px solid var(--uc-terracotta,#9E482D)}
.ucf__status:focus{outline:2px solid var(--uc-gold,#A26E3A);outline-offset:2px}
.ucf__hp{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}
@media (max-width:480px){.ucf__submit.uc-btn,.ucf__submit{align-self:stretch}}
</style>
		<?php
	}

	$status_cls = $sent ? ' ucf__status--ok' : ( $err ? ' ucf__status--err' : '' );
	$status_txt = $sent ? $msgs['sent'] : ( $err ? $msgs[ $err ] : '' );
	?>
<section class="ucf" id="ucf" aria-labelledby="ucf-h" dir="rtl">
  <h2 id="ucf-h">משהו אחר על הלב? כתבו לנו</h2>
  <p class="ucf__lead">אנחנו קוראים כל הודעה. בדרך כלל אנחנו עונים תוך כ-48 שעות.</p>

  <div class="ucf__status<?php echo esc_attr( $status_cls ); ?>" id="ucf-status" role="status" aria-live="polite" tabindex="-1"><?php echo esc_html( $status_txt ); ?></div>

  <form class="ucf__form" id="ucf-form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
    <input type="hidden" name="action" value="<?php echo esc_attr( UCF_ACTION ); ?>">
    <?php wp_nonce_field( 'ucf_send', 'ucf_nonce', false ); ?>
    <input type="hidden" name="ucf_ts" value="<?php echo esc_attr( $ts ); ?>">
    <input type="hidden" name="ucf_tsh" value="<?php echo esc_attr( $tsh ); ?>">
    <input type="hidden" name="ucf_page" value="<?php echo esc_attr( $from ); ?>">

    <div class="ucf__hp" aria-hidden="true">
      <label for="ucf-website">אתר אינטרנט (להשאיר ריק)</label>
      <input type="text" id="ucf-website" name="ucf_website" tabindex="-1" autocomplete="off" value="">
    </div>

    <div class="ucf__field">
      <label for="ucf-name">שם <span class="ucf__opt">(לא חובה)</span></label>
      <input type="text" id="ucf-name" name="ucf_name" maxlength="100" autocomplete="name" value="<?php echo esc_attr( $o( 'name' ) ); ?>">
    </div>

    <div class="ucf__field">
      <label for="ucf-email">אימייל לתשובה <span class="ucf__opt">(לא חובה, אבל בלעדיו לא נוכל לענות)</span></label>
      <input type="email" id="ucf-email" name="ucf_email" maxlength="254" autocomplete="email" inputmode="email" spellcheck="false" value="<?php echo esc_attr( $o( 'email' ) ); ?>">
    </div>

    <div class="ucf__field">
      <label for="ucf-subject">נושא</label>
      <select id="ucf-subject" name="ucf_subject" aria-describedby="ucf-hint">
        <?php foreach ( $subjects as $key => $label ) : ?>
          <option value="<?php echo esc_attr( $key ); ?>"<?php selected( $pre, $key ); ?>><?php echo esc_html( $label ); ?></option>
        <?php endforeach; ?>
      </select>
      <p class="ucf__hint" id="ucf-hint"<?php echo 'copyright' === $pre ? '' : ' hidden'; ?>>ציינו את כתובת העמוד באתר ומה בבקשה להסיר.</p>
    </div>

    <div class="ucf__field">
      <label for="ucf-message">הודעה <span class="ucf__req" aria-hidden="true">*</span><span class="screen-reader-text"> (חובה)</span></label>
      <textarea id="ucf-message" name="ucf_message" rows="6" required minlength="<?php echo (int) UCF_MSG_MIN; ?>" maxlength="<?php echo (int) UCF_MSG_MAX; ?>" aria-describedby="ucf-msg-help"><?php echo esc_textarea( $o( 'message' ) ); ?></textarea>
      <p class="ucf__help" id="ucf-msg-help">בין <?php echo (int) UCF_MSG_MIN; ?> ל-<?php echo (int) UCF_MSG_MAX; ?> תווים.</p>
    </div>

    <button type="submit" class="uc-btn uc-btn--primary ucf__submit" id="ucf-submit">שליחת ההודעה</button>
    <p class="ucf__note">הפרטים משמשים רק כדי לענות לכם, ולא נמסרים לאף אחד.</p>
  </form>
</section>
<script>
(function(){
  var form=document.getElementById('ucf-form'); if(!form||!window.fetch||!window.FormData) return;
  var st=document.getElementById('ucf-status'), btn=document.getElementById('ucf-submit'),
      sel=document.getElementById('ucf-subject'), hint=document.getElementById('ucf-hint'),
      msg=document.getElementById('ucf-message'), em=document.getElementById('ucf-email'),
      label=btn.textContent, busy=false,
      T={short:<?php echo wp_json_encode( $msgs['msg_short'] ); ?>,email:<?php echo wp_json_encode( $msgs['email_bad'] ); ?>,server:<?php echo wp_json_encode( $msgs['server'] ); ?>};
  function show(t,ok){ st.className='ucf__status '+(ok?'ucf__status--ok':'ucf__status--err'); st.textContent=t; }
  function syncHint(){ hint.hidden = sel.value!=='copyright'; }
  sel.addEventListener('change',syncHint); syncHint();
  form.setAttribute('novalidate','');
  form.addEventListener('submit',function(e){
    e.preventDefault(); if(busy) return;
    var m=msg.value.trim();
    if(m.length<<?php echo (int) UCF_MSG_MIN; ?>){ show(T.short,false); msg.setAttribute('aria-invalid','true'); msg.focus(); return; }
    msg.removeAttribute('aria-invalid');
    if(em.value.trim() && !em.checkValidity()){ show(T.email,false); em.setAttribute('aria-invalid','true'); em.focus(); return; }
    em.removeAttribute('aria-invalid');
    busy=true; btn.disabled=true; btn.setAttribute('aria-busy','true'); btn.textContent='שולחים…';
    st.className='ucf__status'; st.textContent='';
    var fd=new FormData(form); fd.append('ucf_ajax','1');
    fetch(form.action,{method:'POST',body:fd,credentials:'same-origin',headers:{'Accept':'application/json'}})
      .then(function(r){ return r.json(); })
      .then(function(j){
        var d=(j&&j.data)||{};
        if(j&&j.success){ show(d.message,true); form.reset(); syncHint(); }
        else { show(d.message||T.server,false); }
        st.focus();
      })
      .catch(function(){ show(T.server,false); st.focus(); })
      .then(function(){ busy=false; btn.disabled=false; btn.removeAttribute('aria-busy'); btn.textContent=label; });
  });
})();
</script>
	<?php
	return ob_get_clean();
}
add_shortcode( 'uc_contact_form', 'ucf_shortcode' );

/* ─────────────────────────── handler ─────────────────────────── */

/** מסיים בקשה: JSON (fetch) או הפניה חזרה (ללא JS). */
function ucf_finish( $code, $old = array() ) {
	$msgs  = ucf_messages();
	$ok    = ( 'sent' === $code );
	$ajax  = isset( $_POST['ucf_ajax'] ) && '1' === $_POST['ucf_ajax'];
	if ( $ajax ) {
		$payload = array( 'code' => $code, 'message' => $msgs[ $code ] );
		if ( $ok ) { wp_send_json_success( $payload ); }
		wp_send_json_error( $payload, 'server' === $code ? 500 : 400 );
	}
	if ( ! $ok && $old ) {
		set_transient( 'ucf_old_' . ucf_ip_hash(), $old, 5 * MINUTE_IN_SECONDS );
	}
	$back = wp_get_referer();
	$back = $back ? wp_validate_redirect( $back, '' ) : '';
	if ( ! $back ) { $back = home_url( '/contact/' ); }
	$back = remove_query_arg( array( 'sent', 'ucf_err' ), $back );
	$back = $ok ? add_query_arg( 'sent', '1', $back ) : add_query_arg( 'ucf_err', $code, $back );
	wp_safe_redirect( $back . '#ucf', 303 );
	exit;
}

/** בונה את המייל (נפרד כדי שאפשר לבדוק אותו). */
function ucf_build_mail( $d ) {
	$subjects = ucf_subjects();
	$label    = $subjects[ $d['subject'] ];
	$name     = ucf_one_line( $d['name'] );
	$email    = ucf_one_line( $d['email'] );

	$subject = '[unichord] ' . $label . ( '' !== $name ? ' – ' . $name : '' );
	$subject = ucf_one_line( mb_substr( $subject, 0, 160 ) );

	$headers = array( 'Content-Type: text/plain; charset=UTF-8' );
	if ( '' !== $email && is_email( $email ) ) {
		$headers[] = 'Reply-To: ' . $email;
	}

	$body  = "פנייה חדשה מטופס יצירת הקשר ב-unichord\n\n";
	$body .= 'נושא: ' . $label . "\n";
	$body .= 'שם: ' . ( '' !== $name ? $name : '(לא צוין)' ) . "\n";
	$body .= 'אימייל לתשובה: ' . ( '' !== $email ? $email : '(לא צוין)' ) . "\n";
	$body .= 'עמוד: ' . ( $d['page'] ? $d['page'] : '(לא צוין)' ) . "\n";
	$body .= 'משתמש מחובר: ' . ( $d['user_id'] ? '#' . $d['user_id'] : 'לא' ) . "\n";
	$body .= 'זמן: ' . wp_date( 'Y-m-d H:i' ) . "\n";
	if ( ! empty( $d['post_id'] ) ) {
		$body .= 'בממשק הניהול: ' . admin_url( 'post.php?post=' . (int) $d['post_id'] . '&action=edit' ) . "\n";
	}
	$body .= "\n----------------------------------------\n" . $d['message'] . "\n----------------------------------------\n";
	if ( '' === $email ) {
		$body .= "\n(לא הושארה כתובת לתשובה)\n";
	}
	return array( 'to' => UC_CONTACT_TO, 'subject' => $subject, 'body' => $body, 'headers' => $headers );
}

function ucf_handle() {
	// 1. nonce
	$nonce = isset( $_POST['ucf_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['ucf_nonce'] ) ) : '';
	if ( ! $nonce || ! wp_verify_nonce( $nonce, 'ucf_send' ) ) {
		ucf_finish( 'expired' );
	}

	// 2. honeypot: בוט. מדמים הצלחה, לא שומרים ולא שולחים.
	if ( ! empty( $_POST['ucf_website'] ) ) {
		ucf_finish( 'sent' );
	}

	// קלט
	$subjects = ucf_subjects();
	$name     = isset( $_POST['ucf_name'] ) ? ucf_one_line( sanitize_text_field( wp_unslash( $_POST['ucf_name'] ) ) ) : '';
	$name     = mb_substr( $name, 0, 100 );
	$email    = isset( $_POST['ucf_email'] ) ? ucf_one_line( trim( wp_unslash( $_POST['ucf_email'] ) ) ) : '';
	$email    = mb_substr( $email, 0, 254 );
	$subject  = isset( $_POST['ucf_subject'] ) ? sanitize_key( wp_unslash( $_POST['ucf_subject'] ) ) : 'general';
	if ( ! isset( $subjects[ $subject ] ) ) { $subject = 'general'; }
	$message  = isset( $_POST['ucf_message'] ) ? trim( sanitize_textarea_field( wp_unslash( $_POST['ucf_message'] ) ) ) : '';
	$page     = isset( $_POST['ucf_page'] ) ? ucf_clean_page_url( wp_unslash( $_POST['ucf_page'] ) ) : '';
	$old      = array( 'name' => $name, 'email' => $email, 'subject' => $subject, 'message' => $message, 'page' => $page );

	// 3. זמן מילוי חתום
	$ts  = isset( $_POST['ucf_ts'] ) ? absint( $_POST['ucf_ts'] ) : 0;
	$tsh = isset( $_POST['ucf_tsh'] ) ? sanitize_text_field( wp_unslash( $_POST['ucf_tsh'] ) ) : '';
	if ( ! $ts || ! hash_equals( ucf_sign( $ts ), $tsh ) || ( time() - $ts ) > UCF_MAX_AGE ) {
		ucf_finish( 'expired', $old );
	}
	if ( ( time() - $ts ) < UCF_MIN_SECS ) {
		ucf_finish( 'fast', $old );
	}

	// 4. ולידציה
	$len = mb_strlen( $message );
	if ( $len < UCF_MSG_MIN ) { ucf_finish( 'msg_short', $old ); }
	if ( $len > UCF_MSG_MAX ) { ucf_finish( 'msg_long', $old ); }
	if ( '' !== $email ) {
		$clean = sanitize_email( $email );
		if ( ! $clean || ! is_email( $clean ) || $clean !== $email ) { ucf_finish( 'email_bad', $old ); }
		$email = $clean;
	}

	// 5. הגבלת קצב (5 לשעה לכל IP, לפי HMAC)
	$iph    = ucf_ip_hash();
	$rl_key = 'ucf_rl_' . $iph;
	$rl     = get_transient( $rl_key );
	if ( ! is_array( $rl ) || empty( $rl['start'] ) || ( time() - $rl['start'] ) >= UCF_RL_WINDOW ) {
		$rl = array( 'count' => 0, 'start' => time() );
	}
	if ( $rl['count'] >= UCF_RL_MAX ) {
		ucf_finish( 'rate', $old );
	}
	$rl['count']++;
	set_transient( $rl_key, $rl, max( 60, UCF_RL_WINDOW - ( time() - $rl['start'] ) ) );

	// 6. שמירה (קודם כל, כדי ששום פנייה לא תאבד גם אם המייל נכשל)
	$user_id = get_current_user_id();
	$post_id = wp_insert_post( array(
		'post_type'    => UCF_CPT,
		'post_status'  => 'private',
		'post_title'   => wp_strip_all_tags( $subjects[ $subject ] . ( '' !== $name ? ' – ' . $name : '' ) ),
		'post_content' => '',
		'post_author'  => $user_id,
		'meta_input'   => array(
			'_ucf_subject'   => $subject,
			'_ucf_name'      => $name,
			'_ucf_email'     => $email,
			'_ucf_message'   => $message,
			'_ucf_page'      => $page,
			'_ucf_user_id'   => $user_id,
			'_ucf_ip_hash'   => $iph,
			'_ucf_mail_sent' => 0,
		),
	), true );
	if ( is_wp_error( $post_id ) ) { $post_id = 0; }

	// 7. מייל
	$m  = ucf_build_mail( array(
		'subject' => $subject, 'name' => $name, 'email' => $email, 'message' => $message,
		'page' => $page, 'user_id' => $user_id, 'post_id' => $post_id,
	) );
	$ok = wp_mail( $m['to'], $m['subject'], $m['body'], $m['headers'] );
	if ( $post_id ) {
		update_post_meta( $post_id, '_ucf_mail_sent', $ok ? 1 : 0 );
	}

	if ( ! $post_id && ! $ok ) {
		ucf_finish( 'server', $old );
	}
	ucf_finish( 'sent' );
}
add_action( 'admin_post_' . UCF_ACTION, 'ucf_handle' );
add_action( 'admin_post_nopriv_' . UCF_ACTION, 'ucf_handle' );
