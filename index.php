<?php
/*
 * What's My IP Script.
 * PHP Version 5.x,7.x.
 *
 * @see       https://code.paulg.it/paulgit/whatsmyip What's My IP
 *
 * @author    Testo Development (TestoEXE)
 * @author    Paul Git (paulgit) <paulgit@pm.me>
 * @copyright 2019 Testo Development
 * @copyright 2020 Paul Git
 * @license   MIT License
 */

require_once 'IP2Location.php';

// Common headers
header('Vary: Origin');
header('Cache-Control: private, no-cache');

function whatsMyIP()
{ 
	foreach (array('HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED', 'HTTP_X_CLUSTER_CLIENT_IP', 'HTTP_FORWARDED_FOR', 'HTTP_FORWARDED', 'REMOTE_ADDR') as $key)
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

if (isset($_GET["format"]))
{
	$format = trim($_GET["format"]);
}
else
{
	$format = "html";
}

if ($format == "text")
{
	header('Content-Type: text/plain');
	echo $users_ip;
}
else if ($format == "json")
{
	header('Content-Type: application/json');
	echo "{\"ip\":\"$users_ip\"}";
}
else
{
	header("Content-Type: text/html");
	echo "<html><body><div style=\"display: flex;flex-direction: column;justify-content: center;align-items: center;text-align: center;min-height: 50vh;font-family:monospace;font-weight: bold;font-size:7vw;\">";
	echo $users_ip ."<br>";
	$db = new \IP2Location\Database('./databases/IP2LOCATION-LITE-DB3.BIN', \IP2Location\Database::FILE_IO);
	$records = $db->lookup($users_ip, \IP2Location\Database::ALL);		
	echo "<div style=\"font-weight: normal;font-size:4vw;\">" . $records['cityName'] . ", " . $records['regionName'] . "<br>" . $records['countryName'] . "</div>";
	echo "<div style=\"font-weight: normat;font-size:1vw\"><br>This site or product includes IP2Location LITE data available<br>from <a href=\"https://www.ip2location.com\">https://www.ip2location.com.</a></div>";
	echo "</div></body></html>";
}

?>
