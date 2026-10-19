<?php
/*
 * Plugin Name: UC Analytics (cookieless, first-party)
 * Description: מדידה עצמית ללא עוגיות וללא צד-שלישי — טבלת אירועים, endpoint לרישום, וחישוב WRU.
 *              תואם תיקון 13: אין PII, אין IP, המזהה (uid) הוא מזהה-לקוח אקראי ב-localStorage בלבד.
 * Version: 1.2.0
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class UC_Analytics {

	const DB_VERSION   = '2';
	const OPT_DB       = 'uc_analytics_db_version';
	const ASSET_VER    = '1.2.0';

	/** רשימת-אירועים מותרת — כל דבר מחוצה לה נדחה */
	public static function events() {
		return array(
			'song_view', 'transpose', 'easy_toggle', 'autoscroll',
			'favorite', 'notebook_save', 'pwa_offline', 'signup',
			'lyrics_only', 'print', 'share',
		);
	}

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'uc_events';
	}

	public static function init() {
		add_action( 'init', array( __CLASS__, 'maybe_install' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_route' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			WP_CLI::add_command( 'uc', 'UC_Analytics_CLI' );
		}
	}

	/** יצירת הטבלה פעם אחת */
	public static function maybe_install() {
		if ( get_option( self::OPT_DB ) === self::DB_VERSION ) { return; }
		global $wpdb;
		$table   = self::table();
		$charset = $wpdb->get_charset_collate();
		$sql = "CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			ev VARCHAR(32) NOT NULL,
			uid VARCHAR(64) NOT NULL,
			sid BIGINT UNSIGNED NULL,
			day DATE NOT NULL,
			created DATETIME NOT NULL,
			src VARCHAR(12) NULL,
			dev VARCHAR(8) NULL,
			own TINYINT UNSIGNED NOT NULL DEFAULT 0,
			PRIMARY KEY (id),
			KEY uid_day (uid, day),
			KEY ev_day (ev, day)
		) {$charset};";
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
		update_option( self::OPT_DB, self::DB_VERSION );
	}

	/** endpoint לרישום אירוע — פתוח לאנונימיים (זו רק ספירת-שימוש, בלי מידע אישי) */
	public static function register_route() {
		register_rest_route( 'uc/v1', '/ev', array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => array( __CLASS__, 'record' ),
		) );
	}

	/** סורקים/דפדפנים-אוטומטיים (Googlebot מריץ JS ונספר כמבקר חדש בכל עמוד) */
	public static function is_bot_ua( $ua ) {
		$ua = trim( (string) $ua );
		if ( $ua === '' ) { return true; }
		return (bool) preg_match( '/bot\b|bot\/|crawl|spider|slurp|google-inspectiontool|googleother|chrome-lighthouse|headless|phantomjs|puppeteer|playwright|selenium|webdriver|python|curl\/|wget\/|httpclient|go-http|java\/|okhttp|axios|node-fetch/i', $ua );
	}

	/** קטגוריות מותרות בלבד: מקור-הגעה וסוג-מכשיר (בלי כתובות, בלי IP) */
	public static function sources() { return array( 'google', 'search', 'social', 'direct', 'internal', 'other' ); }
	public static function devices() { return array( 'mobile', 'tablet', 'desktop' ); }

	public static function record( WP_REST_Request $req ) {
		if ( self::is_bot_ua( $req->get_header( 'user_agent' ) ) ) {
			return new WP_REST_Response( null, 204 ); // בוט — לא נרשם
		}
		$ev  = sanitize_key( (string) $req->get_param( 'ev' ) );
		if ( ! in_array( $ev, self::events(), true ) ) {
			return new WP_REST_Response( null, 204 ); // מתעלמים בשקט מאירוע לא-מוכר
		}
		// uid: מזהה-לקוח אקראי בלבד. מסננים לתווים בטוחים ואורך סביר.
		$uid = preg_replace( '/[^a-zA-Z0-9]/', '', (string) $req->get_param( 'uid' ) );
		$uid = substr( $uid, 0, 64 );
		if ( strlen( $uid ) < 6 ) {
			return new WP_REST_Response( null, 204 );
		}
		$sid = absint( $req->get_param( 'sid' ) );
		if ( $sid < 1 ) { $sid = null; }

		$src = sanitize_key( (string) $req->get_param( 'src' ) );
		if ( ! in_array( $src, self::sources(), true ) ) { $src = null; }
		$dev = sanitize_key( (string) $req->get_param( 'dev' ) );
		if ( ! in_array( $dev, self::devices(), true ) ) { $dev = null; }
		$own = absint( $req->get_param( 'own' ) ) ? 1 : 0;

		global $wpdb;
		$now = current_time( 'mysql' );
		$wpdb->insert( self::table(), array(
			'ev'      => $ev,
			'uid'     => $uid,
			'sid'     => $sid,
			'day'     => substr( $now, 0, 10 ),
			'created' => $now,
			'src'     => $src,
			'dev'     => $dev,
			'own'     => $own,
		), array( '%s', '%s', ( $sid === null ? '%s' : '%d' ), '%s', '%s', '%s', '%s', '%d' ) );

		return new WP_REST_Response( null, 204 );
	}

	public static function enqueue() {
		if ( is_admin() ) { return; }
		$src = content_url( 'mu-plugins/uc-analytics.js' );
		wp_enqueue_script( 'uc-analytics', $src, array(), self::ASSET_VER, true );
		$sid = ( is_singular( 'achord_song_cpt' ) ) ? (int) get_queried_object_id() : 0;
		wp_localize_script( 'uc-analytics', 'UC_A', array(
			'endpoint' => esc_url_raw( rest_url( 'uc/v1/ev' ) ),
			'sid'      => $sid,
			'own'      => current_user_can( 'manage_options' ) ? 1 : 0, // מנהל מחובר = ביקור-בעלים
		) );
	}

	/**
	 * WRU = משתמשים-חוזרים-שבועיים: מזהים פעילים בשבוע הנוכחי (7 ימים אחרונים)
	 * שהיו פעילים גם בחלון 4 השבועות שלפניו (ימים 7–34 אחורה).
	 * מחזיר מערך עם המספרים המרכזיים.
	 */
	public static function wru_stats() {
		global $wpdb;
		$t = self::table();
		$today = current_time( 'Y-m-d' );

		$this_week = "SELECT DISTINCT uid FROM {$t} WHERE own = 0 AND day >= DATE_SUB(%s, INTERVAL 6 DAY)";
		$prior_win = "SELECT DISTINCT uid FROM {$t} WHERE own = 0 AND day BETWEEN DATE_SUB(%s, INTERVAL 34 DAY) AND DATE_SUB(%s, INTERVAL 7 DAY)";

		$active_week = (int) $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(*) FROM ( {$this_week} ) x", $today ) );
		$wru = (int) $wpdb->get_var( $wpdb->prepare(
			"SELECT COUNT(*) FROM ( {$this_week} ) a JOIN ( {$prior_win} ) b ON a.uid = b.uid",
			$today, $today, $today ) );
		$total_events = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$t} WHERE own = 0" );
		$uniq_all     = (int) $wpdb->get_var( "SELECT COUNT(DISTINCT uid) FROM {$t} WHERE own = 0" );
		$ret_rate = $active_week > 0 ? round( 100.0 * $wru / $active_week, 1 ) : 0.0;

		return array(
			'active_this_week' => $active_week,
			'wru'              => $wru,
			'return_rate_pct'  => $ret_rate,
			'unique_all_time'  => $uniq_all,
			'total_events'     => $total_events,
			'as_of'            => $today,
		);
	}
}

/** פקודת WP-CLI: `wp uc wru` (וגם `wp uc top` לאירועים נפוצים) */
if ( defined( 'WP_CLI' ) && WP_CLI ) {
	class UC_Analytics_CLI {
		/** מציג את מדדי ה-WRU */
		public function wru() {
			$s = UC_Analytics::wru_stats();
			WP_CLI::log( "as_of={$s['as_of']}" );
			WP_CLI::log( "active_this_week = {$s['active_this_week']}" );
			WP_CLI::log( "WRU (returning)  = {$s['wru']}" );
			WP_CLI::log( "return_rate      = {$s['return_rate_pct']}%" );
			WP_CLI::log( "unique_all_time  = {$s['unique_all_time']}" );
			WP_CLI::log( "total_events     = {$s['total_events']}" );
		}
		/**
		 * פילוח מבקרים לפי מקור-הגעה וסוג-מכשיר (בלי ביקורי-בעלים).
		 *
		 * ## OPTIONS
		 * [--days=<n>]  ברירת-מחדל 14
		 */
		public function sources( $args, $assoc ) {
			global $wpdb;
			$t    = UC_Analytics::table();
			$days = isset( $assoc['days'] ) ? max( 1, (int) $assoc['days'] ) : 14;
			foreach ( array( 'src' => 'מקור-הגעה', 'dev' => 'מכשיר' ) as $col => $label ) {
				WP_CLI::log( "-- {$label} ({$days} ימים, מזהים ייחודיים)" );
				$rows = $wpdb->get_results( $wpdb->prepare(
					"SELECT COALESCE({$col},'(לא נמדד)') k, COUNT(DISTINCT uid) u,
					        COUNT(DISTINCT CASE WHEN ev<>'song_view' THEN uid END) active
					 FROM {$t} WHERE own = 0 AND day >= DATE_SUB(CURDATE(), INTERVAL %d DAY)
					 GROUP BY k ORDER BY u DESC", $days ) );
				foreach ( $rows as $r ) {
					$pct = $r->u ? round( 100 * $r->active / $r->u ) : 0;
					WP_CLI::log( str_pad( $r->k, 14 ) . " users={$r->u}  used-feature={$r->active} ({$pct}%)" );
				}
			}
		}
		/** פירוט אירועים ב-30 הימים האחרונים */
		public function top() {
			global $wpdb;
			$t = UC_Analytics::table();
			$rows = $wpdb->get_results( "SELECT ev, COUNT(*) c, COUNT(DISTINCT uid) u FROM {$t} WHERE own = 0 AND day >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY ev ORDER BY c DESC" );
			if ( ! $rows ) { WP_CLI::log( '(no events yet)' ); return; }
			foreach ( $rows as $r ) {
				WP_CLI::log( str_pad( $r->ev, 16 ) . " events={$r->c}  users={$r->u}" );
			}
		}
	}
}

UC_Analytics::init();
