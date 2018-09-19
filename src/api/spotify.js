const fetch = require("node-fetch");
const delay = require('delay');

const {GetUser} = require("./db.js");
const {urlEncode, compareArrays, splitArray} = require("../util.js");

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

// For testing purposes
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

/**
* Authorizes the user
*/
const AuthUser = async (code) => {
  let url = 'https://accounts.spotify.com/api/token';

  let response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Basic ' + new Buffer(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: urlEncode({code, grant_type: "authorization_code", redirect_uri})
  });

  return await response.json();
};

/**
* Gets a new access token to make requests
*/
const RefreshToken = async (identityId) => {
  let refreshToken = refresh_token;

  if (identityId) {
    refreshToken = (await GetUser(identityId)).refresh_token;
  }

  let response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Basic ' + new Buffer(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: urlEncode({refresh_token: refreshToken, grant_type: "refresh_token"})
  });

  let json = await response.json();

  return json.access_token;
};

/**
* Util function to request a paginated response into a full list
* TODO: Move to separate util file, fix the 429 error
*/
const GetList = async (base_url, params) => {
  let list = [];
  let next = base_url;

  do {
    try {
      let response = await fetch(next, params);

      if (response.status === 200) {
        let data = await response.json();

        if (data && data.items && data.items.length > 0) {
          list.push.apply(list, data.items);
          next = data.next;
          console.log(list.length + " / " + data.total);
        }
      } else if (response.status === 429 && response.headers.has("retry-after")) {
        let retryDelay = parseInt(response.headers.get("retry-after"));
        console.log(`Retrying after ${retryDelay} seconds...`);
        // Delay is returned in seconds, we need it in millisec
        await delay(retryDelay * 1000);
      }
    } catch (err) {
      console.log("Error!!!");
      console.error(err);

      if (err && err.message) {
        console.log("Error message: " + err.message);
      }
    }
  } while (next);

  return list;
};

/**
* Gets users recently played tracks
*/
const GetRecentTracks = async (identityId) => {
  let accessToken = await RefreshToken(identityId);

  let response = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=50", {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return await response.json();
};

/**
* Gets users top artists
*/
const GetTopArtists = async (library) => {
  let topArtists = {};

  library.map(t => t.artists).forEach(t => t.forEach(a => {
    if (topArtists[a.id]) {
      topArtists[a.id].count += 1;
    } else {
      topArtists[a.id] = {
        count: 1,
        name: a.name,
        id: a.id
      };
    }
  }));

  return Object.values(topArtists).sort((a, b) => b.count - a.count);
};

/**
* Gets users top tracks
*/
const GetTop = async (identityId, type, time_range) => {
  let accessToken = await RefreshToken(identityId);

  let topTracks = await GetList(`https://api.spotify.com/v1/me/top/${type}?time_range=${time_range}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return topTracks;
};

/**
* Gets users playlists
*/
const GetPlaylists = async (identityId) => {
  let accessToken = await RefreshToken(identityId);

  let {id} = await GetUserProfile(accessToken);
  let playlists = await GetList("https://api.spotify.com/v1/me/playlists?limit=50", {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return playlists.filter(p => p.owner.id === id);
};

/**
* Search Spotify
* TODO: Queries seem iffy, sometimes using * is better, sometimes quotes, sometimes nothing... need to investigate further
*/
const Search = async (identityId, term, type, limit, offset) => {
  let accessToken = await RefreshToken(identityId);
  let url = `https://api.spotify.com/v1/search?q=${term.toLowerCase()}*&type=${type}&limit=${limit}${offset
    ? "&offset=" + offset
    : ""}`;

  console.log("URL: " + url);
  let response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  let data = await response.json();
  return data[type + "s"].items;
};

/**
* Get playlist tracks
*/
const GetPlaylistTracks = async (id, accessToken, identityId) => {
  if (!accessToken)
    accessToken = await RefreshToken(identityId);

  let tracks = await GetList(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return tracks.map(t => t.track);
};

/**
* Uses Spotify's recommendation API to find songs
*/
const GetRecommendedSongs = async (identityId, seed, library) => {
  let accessToken = await RefreshToken(identityId);
  let url = `https://api.spotify.com/v1/recommendations?limit=100&seed_artists=${seed.artistId}${seed.song
    ? "&seed_tracks=" + seed.song.songId
    : ""}`;

  let response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  let data = await response.json();
  console.log("Spotify Tracks: " + JSON.stringify(data, null, 2));

  return data.tracks.filter(t => {
    let arr = t.artists.reduce((acc, x) => {
      acc.push(x.id);
      return acc;
    }, []);

    return !library.filter(l => l.id == t.id || (compareArrays(l.artists.reduce((acc, x) => {
      acc.push(x.id);
      return acc;
    }, []), arr) && l.name === t.name))[0]
  }).sort((a, b) => b.popularity - a.popularity).map(t => {
    return {name: t.name, id: t.id, uri: t.uri, popularity: t.popularity, artists: t.artists};
  });
};

/**
* Tries to find related songs via searching playlists
*/
const GetRelatedSongs = async (identityId, seed, library, num, completed, offset) => {
  let {artistId} = seed;
  let query = seed.song
    ? `${seed.artistName} ${seed.song.songName}`
    : seed.album
      ? `${seed.artistName} ${seed.album.albumName}`
      : seed.artistName;

  let playlists = await Search(identityId, query, "playlist", 5, offset || 0);
  console.log(`${playlists.length} playlists found`);

  // NOTE: Using an object instead of an array to prevent multiple of the same song
  let newSongs = {};
  let accessToken = await RefreshToken(identityId);

  for (let i = 0; i < playlists.length; i++) {
    let p = playlists[i];
    console.log("Getting tracks for playlist " + p.id);
    let songs = await GetPlaylistTracks(p.id, accessToken, identityId);
    console.log(`Got ${songs.length} tracks`);

    // If the playlist does not contain any songs by the artist, we ignore it.
    let shouldIgnore = songs.filter(t => t.artists.map(a => a.id).indexOf(artistId) !== -1).length === 0;

    if (!shouldIgnore) {
      songs.filter(t => {
        let arr = t.artists.reduce((acc, x) => {
          acc.push(x.id);
          return acc;
        }, []);

        return !library.filter(l => l.id == t.id || (compareArrays(l.artists.reduce((acc, x) => {
          acc.push(x.id);
          return acc;
        }, []), arr) && l.name === t.name))[0]
      }).forEach(t => {
        newSongs[t.id] = t;
      });
    }
  }

  // TODO: Does not differentiate between singles and the same song from an album - can cause duplicates

  newSongs = Object.values(newSongs);
  newSongs.sort((a, b) => b.popularity - a.popularity);
  let totalSongs = newSongs.length + (completed || 0);

  if (totalSongs < num && playlists.length > 0) {
    return (await GetRelatedSongs(identityId, seed, library, num, totalSongs, (offset || 0) + 5)).concat(newSongs);
  } else {
    return newSongs;
  }
};

/**
* Gets genres of a track, based on the artists (for now)
*/
const GetGenres = async (t, accessToken) => {
  if (!accessToken)
    accessToken = await RefreshToken();

  let artistIds = t.artists.map(x => x.id);
  let response = await fetch(`https://api.spotify.com/v1/artists?ids=${artistIds.join(",")}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (response.status === 200) {
    let {artists} = await response.json();
    return artists.reduce((acc, x) => acc.push.apply(x.genres), []);
  } else if (response.status === 429 && response.headers.has("retry-after")) {
    // Delay is returned in seconds, we need it in millisec
    await delay(parseInt(response.headers.get("retry-after")) * 1000);

    return await GetGenres(t, accessToken);
  }
};

/**
* Gets songs by the same artist you have not heard before
* Sorted by popularity
* TODO: I think it could be beneficial to also look at release date as a means of sorting
*/
const GetOtherSongs = async (identityId, seed, library) => {
  let accessToken = await RefreshToken(identityId);
  let tracks = await GetAllTracks(accessToken, seed.artistId);

  return tracks.filter(t => {
    let arr = t.artists.reduce((acc, x) => {
      acc.push(x.id);
      return acc;
    }, []);

    return !library.filter(l => l.id == t.id || (compareArrays(l.artists.reduce((acc, x) => {
      acc.push(x.id);
      return acc;
    }, []), arr) && l.name === t.name))[0]
  }).sort((a, b) => b.popularity - a.popularity).map(t => {
    return {name: t.name, id: t.id, uri: t.uri, popularity: t.popularity, artists: t.artists};
  });
};

/**
* Gets the artists top songs
*/
const GetTopSongs = async (accessToken, artistId) => {
  let response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?country=US`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  let data = await response.json();
  return data.tracks;
};

/**
* Get all tracks from albums related to an artist
*/
const GetAllTracks = async (accessToken, artistId) => {
  let tracks = [];
  let albums = await GetAlbums(accessToken, artistId);
  console.log(`Found ${albums.length} albums...`);

  for (let i = 0; i < albums.length; i++) {
    let a = albums[i];

    if (a && a.id) {
      tracks = tracks.concat(await GetAlbumTracks(accessToken, a.id));
      console.log(`${tracks.length} tracks...`);
    }
  }

  let sets = splitArray(tracks.map(t => t.id), 50);
  tracks = [];

  for (let i = 0; i < sets.length; i++) {
    let set = sets[i];
    let response = await fetch(`https://api.spotify.com/v1/tracks?ids=${set.join(",")}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    let data = await response.json();
    console.log(set.length + "-" + JSON.stringify(data, null, 2));

    tracks = tracks.concat(data.tracks);
  }

  return tracks.filter(t => t).map(t => {
    return {name: t.name, id: t.id, uri: t.uri, popularity: t.popularity, artists: t.artists};
  });
};

/**
* Gets the tracks in the album
*/
const GetAlbumTracks = async (accessToken, albumId) => {
  let tracks = await GetList(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return tracks;
};

/**
* Gets the artists related albums
* Includes their own albums, singles, and other artists albums they were on
*/
const GetAlbums = async (accessToken, artistId) => {
  let albums = await GetList(`https://api.spotify.com/v1/artists/${artistId}/albums?limit=50`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return albums;
};

/**
* Gets current users profile
*/
const GetUserProfile = async (accessToken) => {
  let response = await fetch(`https://api.spotify.com/v1/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return await response.json();
}

/**
* Creates a new playlist
*/
const CreatePlaylist = async (identityId, name) => {
  let accessToken = await RefreshToken(identityId);
  let {display_name, id} = await GetUserProfile(accessToken);

  let response = await fetch(`https://api.spotify.com/v1/users/${id}/playlists`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    },
    body: JSON.stringify({name, description: `A custom playlist made for ${display_name}`, "public": false})
  });

  let data = await response.json();
  console.log(JSON.stringify(data, null, 2));

  return data;
};

/**
* Adds specified songs to the playlist
*/
const AddSongsToPlaylist = async (identityId, id, uris) => {
  let accessToken = await RefreshToken(identityId);
  let response = await fetch(`https://api.spotify.com/v1/playlists/${id}/tracks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({uris})
  });

  console.log("Result: [" + JSON.stringify(await response.json()) + "]");
};

/**
* Checks if a song is saved to the users library
*/
const IsTrackSaved = async (identityId, ids) => {
  let accessToken = await RefreshToken(identityId);
  let response = await fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${ids.join(",")}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  return await response.json();
};

/**
* Saves song to the users library
*/
const SaveTrack = async (identityId, ids) => {
  let accessToken = await RefreshToken(identityId);
  await fetch(`https://api.spotify.com/v1/me/tracks?ids=${ids.join(",")}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
};

/**
* Remove song from users library
*/
const RemoveTrack = async (identityId, ids) => {
  let accessToken = await RefreshToken(identityId);
  await fetch(`https://api.spotify.com/v1/me/tracks?ids=${ids.join(",")}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
};

module.exports = {
  AuthUser,
  RefreshToken,
  GetTopArtists,
  GetTop,
  GetGenres,
  GetOtherSongs,
  GetRelatedSongs,
  CreatePlaylist,
  GetPlaylists,
  AddSongsToPlaylist,
  GetPlaylistTracks,
  Search,
  GetRecommendedSongs,
  GetRecentTracks,
  IsTrackSaved,
  SaveTrack,
  RemoveTrack,
  GetUserProfile
};
