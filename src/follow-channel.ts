import axios from 'axios';

interface FollowChannelParams {
  channel: string;
  authToken: string;
}

async function followChannel({ channel, authToken }: FollowChannelParams): Promise<void> {
  try {
    const response = await axios.post(
      `https://kick.com/api/v2/channels/${channel}/follow`,
      {},
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.6',
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'max-age=0',
          'Priority': 'u=1, i',
          'Sec-CH-UA': '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
          'Sec-CH-UA-Mobile': '?0',
          'Sec-CH-UA-Platform': '"Linux"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-GPC': '1',
          'X-KPSDK-CD': '{"workTime":1758820640365,"id":"2ecb4ab32fe9051a9e58c033fadf80cf","answers":[5,2],"duration":61.3,"d":46,"st":1758819508507,"rst":1758819508553}',
          'X-KPSDK-CT': '0bGymelRnizB2SNYGTpIhtJ7cYvFjEtJhbd0nYi20mxMJWGMNgPEX2rZ7GBkrqAweF8aep0ocefFReAlb9UYh3Vzi4LeBnaAR9YTroFjWXAuP7ollsXHJWx3jSdFCLZsWy6eejKfwtdtgMS2Cn1psnBtNZ4P7Qf9ihaG5ln',
          'X-KPSDK-H': '01OFdEOyEUrVqthmOVHIBiF5K1DF4=',
          'X-KPSDK-V': 'j-1.1.28614',
          'Referer': `https://kick.com/${channel}`,
          'Cookie': '_cfuvid=iaqkcTT7S7akERWsVQV8HZ4xrQYq_5RF2O0rCPRkIh4-1758819501374-0.0.1.1-604800000; cookie_preferences_set_v1=%7B%22state%22%3A%7B%22preferences%22%3A%7B%22necessary%22%3Atrue%2C%22functional%22%3Afalse%2C%22performance%22%3Afalse%2C%22targeting%22%3Afalse%2C%22userHasMadeChoice%22%3Atrue%7D%2C%22functionalEnabled%22%3Afalse%2C%22performanceEnabled%22%3Afalse%2C%22targetingEnabled%22%3Afalse%7D%2C%22version%22%3A0%7D; USER_LOCALE=en; session_token=274261066%7C5YhmUV9OJspjoXnBSOyDEukp7DB1xXEHFNvEwcSJ; XSRF-TOKEN=eyJpdiI6ImdLUVFxMEEvbSt4eHlZWmg5THhRZVE9PSIsInZhbHVlIjoicmxFaE05OHhNTXdDeWVhTTJ5dGxRZVo2YVpuYlExaEtEY2pkVmlaOVVQUlFoYU1TOGlrdHRvWnhpTnpPbVF3NlVOL2kzUUZvTlpaYm9QNFZKbFdSSkwxZllaV0xrODdGRTdReVRnWUxmaHluTEF1VnRUZitidjdJTHAzSndJRkUiLCJtYWMiOiIwODdlZWFmZDNjOTlkODc5ODg2ZGZlZjQ5ODM2ODQyMTFiMjgwYWZjNzA3OWNlNmEyZDc3MzJiN2M0YTM4OWZmIiwidGFnIjoiIn0%3D; kick_session=eyJpdiI6IlpjTGo4RlgwN1FubGhxd0llaXFMU3c9PSIsInZhbHVlIjoiNCs5VWg4NmRLbFZVU0QydFlldkNmVnRSSnExZUlKbnBjVUhsQm9XM0FtRU1DbTgvd21MbEVOclNoYkNMejlya0kzSzRobnJPSWRBTnAxNzFiY29DamluZXA5THlyZm9ONkcyOTFjS01PbTBSRTh2aHhkOUpqMS9HTWR4QndZOGIiLCJtYWMiOiIwNmY4MjAxMDZlNzJiN2JkNzAwNDQwOGI5MDEyODRkNjA5NmNjMzY3ZDliYjEzZDc5MmViNzE2ZGRiMDg2MDA4IiwidGFnIjoiIn0%3D; 2xTX3XFuRwg3lmM2caWi47PAGwtSMy7e0TJ4iA2g=eyJpdiI6IjlkV0RmV1pxOVJPOEM3VUE0VFRPVXc9PSIsInZhbHVlIjoiMjZLZDNyNlE5TUhwdFFEZCtLbGxNOVRqS2tPVTUrMW5ZMmMyd1h1QTZlalNPdEl5T01QQXM0eVZXQVg0RHBUc3JxYVR4NmJ2R1VISUxJT2tlNlNuVFF0WHM2RzlHRHF1dGNCWHhhVzU4ck4wM2ZuQ1pPUXltcHFFQVVIeW4yNHJiQTd1VmFncEtRL2t2U1lZUXVUc1hXSzRYMHdoSUNnR0I1WjhXamhMQzZjT1FoRFRMbGJaak9rVFkvQWpvcjJWK1Q4SlA1SW8xSUtTWkJCWmFSWElWSEhMbmR3ODVsSElNRFJHTmtUMlViQnh5SjRVREg2aFNpUlQzQ2RjT0lzdlpsWUxGL3h2T0hmN1lXWTE2UmJCa0daSmZLL0J5d01YUU1YZEptcm5YNlV5VmJSSS8rUng3Zlk5V3V6Tm5kdVI4RVMxaXVPT2ptRm1TcmU1dlh5dXFXc25DaGdHZXI2TVNGZUxUeXplMWV6eWxTQWVUNUpvWGFpMUR3TSs5UGdUakZTTGtUZVV0NTZyMHNWNDNXOW5qNnZjK05PM1BadmNzYWxERkdDeWFZQnVMMkFCODRUT1BvNU4wYlBZM2QrMjRWcEs1WVp1NzRqM2c2Q2xmV1AvRTlWaE1GdXZSVkoyU1hqa2JPai9nYlkrdnk5bDdJa1RaQ1d0eXRoWjVqZjUvSGZWeUY4c0g3ZGVQS1VVd21udElyZy9vRzZPWFVLWStFMW54YW5yNFhabXhjb2VRL1V3ZTU2SytZd1ROcWErNTc0K2ZnQStTZUZkQmdGQXVPdjBQNm9KTVQvZTZqT2VCdlUvYktnTlNOemNudnBoWkszNDdVZUVMYkRVTkFsQ1dvV0dldGRJNkNZWG1MNWZyNGZBd0JvRmZBeEVXeU42eCtrNVdCZ0ErMkdUSmM0NHd1MkdHVlZIcVpmOTByOGVNYTRkYStTdVRGQ1poN0dQOHNCd3QxbUxmWUV0ZVVQeDd5eGg3SS9yMVJ5VHVWbmtjUW1KaXduQ1VXbUJETTBWYkVJaVNsQXF4WEZ3S1FRU0hFdFJpVG5qY29GU2FGNVBCV2Q4QXlrSnREUHdMeUMvZlVOUjlqUTBZTDI2SENMa1daOEUzeWVMbFJEbWRUQ2NlZVdadWVVc284RWJkVHdDZWwwcllUZ2hBNjA9IiwibWFjIjoiMjNiYjI2YzkwNjc2MWEzYThkZWQ1OTg0ZGYwOWEwMmNjYTNiODk3OWFhZGRhNTBkMDExOGRlYmQzOWYzYjEwNyIsInRhZyI6IiJ9; _iidt=j7B9TZ901XAHOpmY/lKDcf0XmF3KHEHQCyrE/H1iPOeuuDLb/kwzjFLDvFrskzJgBTqEPo6T+ze71/Zrne/AVXgTJLKIVqs7Wajp8EI=; KP_UIDz-ssn=02QjRfJ9Ame9e5xlcYYaRin1qRVdPdt4XAhtskndN0NXwNYNkM1xjcfoDn233B590fcvPts0tKMKbYz1pqtv6gtELuClxaxMZ3Eec1jkoMkBsX5PjrwBmdwMdOrI14cH1XINdiynxO9S3duWhrJei4SKuCu3K7bfwVbnZkFhIZ; KP_UIDz=02QjRfJ9Ame9e5xlcYYaRin1qRVdPdt4XAhtskndN0NXwNYNkM1xjcfoDn233B590fcvPts0tKMKbYz1pqtv6gtELuClxaxMZ3Eec1jkoMkBsX5PjrwBmdwMdOrI14cH1XINdiynxO9S3duWhrJei4SKuCu3K7bfwVbnZkFhIZ; cf_clearance=9w2WoVf94gHvgSPQvsn_t6NJ2qKWcZtaHAo1qKBTE7Y-1758820257-1.2.1.1-1zpg9Ld10imchzmO0isM7BzW.nGL7obD4IRNU492i9Gl4WU_crz0KxywhsFkXmSWLypIzGvQ8H7Ady5G__63ccEnXVLvWjJwui_QD_pa.AQCiYvldIG90tLWUIgPSNwPtcprbKMLUOC5IfomKaJCaBH4ZntbMg47.KH5MiKtNi85BoXBNc.8Y9Do2bjbPyKQgz2VCBtDShKoNnghtq.y58brvGA7VfzYK.xy6Cs21TQ; __stripe_mid=a5c46427-06c0-414d-b25b-fdeff6d18c2db55a0c; __stripe_sid=7588f348-c990-43ee-b0c3-4c199a9bd06218225e; __cf_bm=s08PpSn9LL6tayq1aqskZ6ot4nNSaiv.gH838md_K_c-1758820639-1.0.1.1-CnQhz4BYXzAoCvdNHWivUarHWOTdkxhser4WycH0RohOtLguUZesiDMMknxCxlQWvjTKdERNssTevGMWzk0a_BOhQPumbYik5cslu2dTXts'
        }
      }
    );

    console.log('✅ Successfully followed channel:', channel);
    console.log('Response:', response.data);
  } catch (error: any) {
    console.error('❌ Error following channel:', channel);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Response:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// CLI usage
const [,, channel, authToken] = process.argv;

if (!channel || !authToken) {
  console.error('Usage: npm run follow <channel> <authToken>');
  process.exit(1);
}

followChannel({ channel, authToken });