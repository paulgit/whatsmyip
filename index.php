<?php
/*
 * What's My IP Script.
 * PHP Version 8.x.
 *
 * @see       https://code.paulg.it/paulgit/whatsmyip What's My IP
 *
 * @author    Testo Development (TestoEXE)
 * @author    Paul Git (paulgit) <paulgit@pm.me>
 * @copyright 2019 Testo Development
 * @copyright 2025 Paul Git
 * @license   MIT License
 */

// Common headers to prevent browsers from caching
header('Vary: *');
header("Cache-Control: no-cache, no-store, max-age=1"); // HTTP 1.1.
header("Pragma: no-cache"); // HTTP 1.0.

function codeToCountry( $code )
{
	$code = strtoupper($code);

	$countryList = array(
		'AF' => 'Afghanistan',
		'AX' => 'Aland Islands',
		'AL' => 'Albania',
		'DZ' => 'Algeria',
		'AS' => 'American Samoa',
		'AD' => 'Andorra',
		'AO' => 'Angola',
		'AI' => 'Anguilla',
		'AQ' => 'Antarctica',
		'AG' => 'Antigua and Barbuda',
		'AR' => 'Argentina',
		'AM' => 'Armenia',
		'AW' => 'Aruba',
		'AU' => 'Australia',
		'AT' => 'Austria',
		'AZ' => 'Azerbaijan',
		'BS' => 'Bahamas the',
		'BH' => 'Bahrain',
		'BD' => 'Bangladesh',
		'BB' => 'Barbados',
		'BY' => 'Belarus',
		'BE' => 'Belgium',
		'BZ' => 'Belize',
		'BJ' => 'Benin',
		'BM' => 'Bermuda',
		'BT' => 'Bhutan',
		'BO' => 'Bolivia',
		'BA' => 'Bosnia and Herzegovina',
		'BW' => 'Botswana',
		'BV' => 'Bouvet Island (Bouvetoya)',
		'BR' => 'Brazil',
		'IO' => 'British Indian Ocean Territory (Chagos Archipelago)',
		'VG' => 'British Virgin Islands',
		'BN' => 'Brunei Darussalam',
		'BG' => 'Bulgaria',
		'BF' => 'Burkina Faso',
		'BI' => 'Burundi',
		'KH' => 'Cambodia',
		'CM' => 'Cameroon',
		'CA' => 'Canada',
		'CV' => 'Cape Verde',
		'KY' => 'Cayman Islands',
		'CF' => 'Central African Republic',
		'TD' => 'Chad',
		'CL' => 'Chile',
		'CN' => 'China',
		'CX' => 'Christmas Island',
		'CC' => 'Cocos (Keeling) Islands',
		'CO' => 'Colombia',
		'KM' => 'Comoros the',
		'CD' => 'Congo',
		'CG' => 'Congo the',
		'CK' => 'Cook Islands',
		'CR' => 'Costa Rica',
		'CI' => 'Cote d\'Ivoire',
		'HR' => 'Croatia',
		'CU' => 'Cuba',
		'CY' => 'Cyprus',
		'CZ' => 'Czech Republic',
		'DK' => 'Denmark',
		'DJ' => 'Djibouti',
		'DM' => 'Dominica',
		'DO' => 'Dominican Republic',
		'EC' => 'Ecuador',
		'EG' => 'Egypt',
		'SV' => 'El Salvador',
		'GQ' => 'Equatorial Guinea',
		'ER' => 'Eritrea',
		'EE' => 'Estonia',
		'ET' => 'Ethiopia',
		'FO' => 'Faroe Islands',
		'FK' => 'Falkland Islands (Malvinas)',
		'FJ' => 'Fiji the Fiji Islands',
		'FI' => 'Finland',
		'FR' => 'France, French Republic',
		'GF' => 'French Guiana',
		'PF' => 'French Polynesia',
		'TF' => 'French Southern Territories',
		'GA' => 'Gabon',
		'GM' => 'Gambia the',
		'GE' => 'Georgia',
		'DE' => 'Germany',
		'GH' => 'Ghana',
		'GI' => 'Gibraltar',
		'GR' => 'Greece',
		'GL' => 'Greenland',
		'GD' => 'Grenada',
		'GP' => 'Guadeloupe',
		'GU' => 'Guam',
		'GT' => 'Guatemala',
		'GG' => 'Guernsey',
		'GN' => 'Guinea',
		'GW' => 'Guinea-Bissau',
		'GY' => 'Guyana',
		'HT' => 'Haiti',
		'HM' => 'Heard Island and McDonald Islands',
		'VA' => 'Holy See (Vatican City State)',
		'HN' => 'Honduras',
		'HK' => 'Hong Kong',
		'HU' => 'Hungary',
		'IS' => 'Iceland',
		'IN' => 'India',
		'ID' => 'Indonesia',
		'IR' => 'Iran',
		'IQ' => 'Iraq',
		'IE' => 'Ireland',
		'IM' => 'Isle of Man',
		'IL' => 'Israel',
		'IT' => 'Italy',
		'JM' => 'Jamaica',
		'JP' => 'Japan',
		'JE' => 'Jersey',
		'JO' => 'Jordan',
		'KZ' => 'Kazakhstan',
		'KE' => 'Kenya',
		'KI' => 'Kiribati',
		'KP' => 'Korea',
		'KR' => 'Korea',
		'KW' => 'Kuwait',
		'KG' => 'Kyrgyz Republic',
		'LA' => 'Lao',
		'LV' => 'Latvia',
		'LB' => 'Lebanon',
		'LS' => 'Lesotho',
		'LR' => 'Liberia',
		'LY' => 'Libyan Arab Jamahiriya',
		'LI' => 'Liechtenstein',
		'LT' => 'Lithuania',
		'LU' => 'Luxembourg',
		'MO' => 'Macao',
		'MK' => 'Macedonia',
		'MG' => 'Madagascar',
		'MW' => 'Malawi',
		'MY' => 'Malaysia',
		'MV' => 'Maldives',
		'ML' => 'Mali',
		'MT' => 'Malta',
		'MH' => 'Marshall Islands',
		'MQ' => 'Martinique',
		'MR' => 'Mauritania',
		'MU' => 'Mauritius',
		'YT' => 'Mayotte',
		'MX' => 'Mexico',
		'FM' => 'Micronesia',
		'MD' => 'Moldova',
		'MC' => 'Monaco',
		'MN' => 'Mongolia',
		'ME' => 'Montenegro',
		'MS' => 'Montserrat',
		'MA' => 'Morocco',
		'MZ' => 'Mozambique',
		'MM' => 'Myanmar',
		'NA' => 'Namibia',
		'NR' => 'Nauru',
		'NP' => 'Nepal',
		'AN' => 'Netherlands Antilles',
		'NL' => 'Netherlands the',
		'NC' => 'New Caledonia',
		'NZ' => 'New Zealand',
		'NI' => 'Nicaragua',
		'NE' => 'Niger',
		'NG' => 'Nigeria',
		'NU' => 'Niue',
		'NF' => 'Norfolk Island',
		'MP' => 'Northern Mariana Islands',
		'NO' => 'Norway',
		'OM' => 'Oman',
		'PK' => 'Pakistan',
		'PW' => 'Palau',
		'PS' => 'Palestinian Territory',
		'PA' => 'Panama',
		'PG' => 'Papua New Guinea',
		'PY' => 'Paraguay',
		'PE' => 'Peru',
		'PH' => 'Philippines',
		'PN' => 'Pitcairn Islands',
		'PL' => 'Poland',
		'PT' => 'Portugal, Portuguese Republic',
		'PR' => 'Puerto Rico',
		'QA' => 'Qatar',
		'RE' => 'Reunion',
		'RO' => 'Romania',
		'RU' => 'Russian Federation',
		'RW' => 'Rwanda',
		'BL' => 'Saint Barthelemy',
		'SH' => 'Saint Helena',
		'KN' => 'Saint Kitts and Nevis',
		'LC' => 'Saint Lucia',
		'MF' => 'Saint Martin',
		'PM' => 'Saint Pierre and Miquelon',
		'VC' => 'Saint Vincent and the Grenadines',
		'WS' => 'Samoa',
		'SM' => 'San Marino',
		'ST' => 'Sao Tome and Principe',
		'SA' => 'Saudi Arabia',
		'SN' => 'Senegal',
		'RS' => 'Serbia',
		'SC' => 'Seychelles',
		'SL' => 'Sierra Leone',
		'SG' => 'Singapore',
		'SK' => 'Slovakia (Slovak Republic)',
		'SI' => 'Slovenia',
		'SB' => 'Solomon Islands',
		'SO' => 'Somalia, Somali Republic',
		'ZA' => 'South Africa',
		'GS' => 'South Georgia and the South Sandwich Islands',
		'ES' => 'Spain',
		'LK' => 'Sri Lanka',
		'SD' => 'Sudan',
		'SR' => 'Suriname',
		'SJ' => 'Svalbard & Jan Mayen Islands',
		'SZ' => 'Swaziland',
		'SE' => 'Sweden',
		'CH' => 'Switzerland, Swiss Confederation',
		'SY' => 'Syrian Arab Republic',
		'TW' => 'Taiwan',
		'TJ' => 'Tajikistan',
		'TZ' => 'Tanzania',
		'TH' => 'Thailand',
		'TL' => 'Timor-Leste',
		'TG' => 'Togo',
		'TK' => 'Tokelau',
		'TO' => 'Tonga',
		'TT' => 'Trinidad and Tobago',
		'TN' => 'Tunisia',
		'TR' => 'Turkey',
		'TM' => 'Turkmenistan',
		'TC' => 'Turks and Caicos Islands',
		'TV' => 'Tuvalu',
		'UG' => 'Uganda',
		'UA' => 'Ukraine',
		'AE' => 'United Arab Emirates',
		'GB' => 'United Kingdom',
		'US' => 'United States of America',
		'UM' => 'United States Minor Outlying Islands',
		'VI' => 'United States Virgin Islands',
		'UY' => 'Uruguay, Eastern Republic of',
		'UZ' => 'Uzbekistan',
		'VU' => 'Vanuatu',
		'VE' => 'Venezuela',
		'VN' => 'Vietnam',
		'WF' => 'Wallis and Futuna',
		'EH' => 'Western Sahara',
		'YE' => 'Yemen',
		'ZM' => 'Zambia',
		'ZW' => 'Zimbabwe'
	);

	if( !$countryList[$code] ) 
		return $code;
	else 
		return $countryList[$code];
}

function ipInfo($ip,$token) 
{
	$url = "https://ipinfo.io/{$ip}?token\={$token}";
	$json = file_get_contents($url);
	$details = json_decode($json,true);
	return $details;
}

function whatsMyIP()
{ 
	foreach (array('HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED', 'HTTP_X_CLUSTER_CLIENT_IP', 'HTTP_FORWARDED_FOR', 'HTTP_FORWARDED', 'REMOTE_HOST', 'REMOTE_ADDR') as $key)
	{
		if (array_key_exists($key, $_SERVER) === true)
		{
			foreach (array_map('trim', explode(',', $_SERVER[$key])) as $ip)
			{
				if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false)
				{
					return $ip;
				}
			}
		}
	}
}

$users_ip = whatsMyIP();
if (!$users_ip) 
{
//	die("Unable to determine your IP address.");
}

// Get format type (default to 'html')
$format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'html';

// Load API token from config
$config = include 'config.php';
$records = ipInfo($users_ip, $config['token']);

if ($format === 'json') 
{
	header('Content-Type: application/json');
	echo json_encode(["ip" => $users_ip]);
	exit;
} 
elseif ($format === 'text') 
{
	header('Content-Type: text/plain');
	echo $users_ip;
	exit;
}
?>	
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>IP Information</title>
	<style>
		body {
			display: flex;
			justify-content: flex-start; /* Aligns content to the top */
			align-items: center;
			text-align: center;
			min-height: 100vh;
			font-family: 'Helvetica Neue', 'Helvetica', sans-serif;
			margin: 0;
			padding: 20px;
			background-color: #f8f8f8;
			flex-direction: column; /* Ensures content stacks vertically */
		}
		.container {
			display: flex;
			flex-direction: column;
			align-items: center; /* Centers content horizontally */
			justify-content: flex-start; /* Aligns content at the top */
			max-width: 90%;
			width: 100%;
			padding-top: 20px; /* Adds space at the top */
		}
		.ip-address {
			font-size: 8vw;
			font-weight: bold;
		}
		.isp {
			font-size: 3vw;
			font-weight: normal;
			margin-top: 10px;
		}
		.location {
			font-size: 4vw;
			font-weight: normal;
			margin-top: 10px;
		}
		.flag {
			width: 10vw;
			height: auto;
			object-fit: cover;
			margin-top: 10px;
		}
		.credits {
			font-size: 1.5vw;
			font-style: italic;
			margin-top: 20px;
		}
		.credits a {
			color: #0073e6;
			text-decoration: none;
		}
		.credits a:hover {
			text-decoration: underline;
		}
		
		/* Responsive Adjustments */
		@media (max-width: 768px) {
			.ip-address { font-size: 10vw; }
			.isp { font-size: 4vw; }
			.location { font-size: 5vw; }
			.flag { width: 15vw; }
			.credits { font-size: 2.5vw; }
		}
	</style>
</head>
<body>
	<script>
		function adjustFontSize() {
			const element = document.querySelector(".ip-address");
			let fontSize = 8; // Start at 8vw
			element.style.fontSize = `${fontSize}vw`;
			
			while (element.scrollWidth > window.innerWidth * 0.9 && fontSize > 1) {
				fontSize -= 0.5; // Reduce font size
				element.style.fontSize = `${fontSize}vw`;
			}
		}
		
		// Run on load and resize
		window.addEventListener("resize", adjustFontSize);
		window.addEventListener("load", adjustFontSize);
	</script>
	<div class="container">
		<div class="ip-address"><?php echo $users_ip ?></div>
		<div class="isp"><?php echo $records['org'] ?></div>
		<div class="location"><p><?php echo $records['city'] . ", " . $records['region'] . "<br>" . codeToCountry($records['country']) ."<br>"?>
			<img class="flag" src=<?php echo "flags/" . strtolower($records['country']) . "_64.png" ?> alt="Flag">
		</div>
		<div class="credits">
			This site or product includes IP2Location™ Country Flags available from 
			<a href="https://www.ip2location.com">IP2Location</a>
		</div>
	</div>
</body>
</html>
