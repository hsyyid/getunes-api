// Load sensitive variables from .env
require('dotenv').config();

const ApiBuilder = require('claudia-api-builder'),
  fetch = require("node-fetch"),
  spotify = require("./src/api/spotify.js"),
  ecs = require("./src/api/ecs.js"),
  s3 = require("./src/api/s3.js"),
  cognito = require("./src/api/cognito.js"),
  db = require("./src/api/db.js"),
  api = new ApiBuilder();

module.exports = api;

/**
* Enables users to search for an artist, track, or album to use as a seed
*/
api.get('/search', async (req) => {
  let {identityId, q, type} = req.proxyRequest.queryStringParameters;
  let response = await spotify.Search(identityId, q.replace(" ", "%20"), type.toLowerCase(), 5);
  console.log(`[/search?identityId=${identityId}]: ${JSON.stringify(response, null, 2)}`);

  return response;
});

/**
* returns the users most recently listened to tracks
*/
api.get('/user/recent', async (req) => {
  let {identityId} = req.proxyRequest.queryStringParameters;
  let response = await spotify.GetRecentTracks(identityId);
  console.log(`[/user/recent?identityId=${identityId}]: ${JSON.stringify(response, null, 2)}`);

  return response;
});

/**
* returns the users favorite tracks and artists
*/
api.get('/user/favorites', async (req) => {
  let {identityId} = req.proxyRequest.queryStringParameters;

  let topTracks = await spotify.GetTop(identityId, "tracks", "medium_term");
  let topArtists = await spotify.GetTop(identityId, "artists", "medium_term");
  let response = {
    topTracks,
    topArtists
  };

  console.log(`[/user/favorites?identityId=${identityId}]: ${JSON.stringify(response, null, 2)}`);

  return response;
});

/**
* returns the active getunes playlists made for the user
*/
api.get('/user/playlists/getunes', async (req) => {
  let {identityId} = req.proxyRequest.queryStringParameters;
  let playlists = await spotify.GetPlaylists(identityId);
  console.log("playlists: " + playlists.length);

  let data = await s3.GetData(identityId, "playlists.json");
  console.log("data: " + JSON.stringify(data, null, 2));

  let response = [];

  if (data) {
    let arr = JSON.parse(data);
    response = playlists.filter(p => arr.filter(d => d === p.id)[0]);
  }

  for (let i = 0; i < response.length; i++) {
    response[i].tracks = await spotify.GetPlaylistTracks(response[i].id, undefined, identityId);
  }

  console.log(`[/user/playlists/getunes?identityId=${identityId}]: ${JSON.stringify(response, null, 2)}`);

  return response;
});

/**
* returns an access token for Spotify. Used to initialize the player on the website
*/
api.get('/access-token', async (req) => {
  let {identityId} = req.proxyRequest.queryStringParameters;
  return await spotify.RefreshToken(identityId);
});

/**
* Creates a playlist based on the seed, method, and number of songs
* and saves the playlist id and tracks to S3
* returns the track uris of the playlist
*/
api.post('/playlist', async (req) => {
  let {method, seed, num, identityId} = req.body;
  console.log("Seed: " + JSON.stringify(seed, null, 2));

  let tracks = [];

  // Get library
  // TODO: What if somehow we failed to get their library before?
  let songs = JSON.parse((await s3.GetData(identityId, "library/tracks.json")) || "[]");
  let playlistTracks = JSON.parse((await s3.GetData(identityId, "library/playlist-tracks.json")) || "[]");
  let recommendedTracks = JSON.parse((await s3.GetData(identityId, "recommended/playlist-tracks.json")) || "[]");

  let library = songs.concat(playlistTracks).concat(recommendedTracks);

  console.log(`[${library.length} tracks read from library]`);

  switch (method) {
    case "related":
      tracks = await spotify.GetRelatedSongs(identityId, seed, library, num);
      break;
    case "other":
      tracks = await spotify.GetOtherSongs(identityId, seed, library);
      break;
    case "spotify":
      tracks = await spotify.GetRecommendedSongs(identityId, seed, library);
      break;
  }

  console.log(`[/user/playlists?identityId=${identityId}]: ${tracks.length} tracks found to recommend`);

  let playlist = await spotify.CreatePlaylist(identityId, `Getunes: ${seed.artistName}`);
  tracks = tracks.filter(t => t).slice(0, num);
  await spotify.AddSongsToPlaylist(identityId, playlist.id, tracks.map(t => t.uri));

  if (playlist && playlist.id) {
    await s3.AddOrCreateData(identityId, "playlists.json", playlist.id);
    await s3.AddOrCreateData(identityId, "recommended/playlist-tracks.json", tracks);
  }

  console.log(`[/user/playlists?identityId=${identityId}]: Returning ${tracks.length} tracks.`);

  playlist.tracks = tracks;
  return playlist;
});

/**
* Used to authorize a user that logs in via Spotify
* and adds the user to DynamoDB if not already existing
*/
api.post('/auth', async (req) => {
  let {code} = req.body;
  console.log(`Authorizing: ${code}`);

  let {access_token, refresh_token} = await spotify.AuthUser(code);
  let profile = await spotify.GetUserProfile(access_token);
  console.log(`Got ID: ${profile && profile.id}`);

  let cognitoIdentity = await cognito.GetIdentity(profile.id);
  console.log(JSON.stringify(cognitoIdentity, null, 2));

  if (cognitoIdentity && cognitoIdentity.IdentityId) {
    let user = await db.GetUser(cognitoIdentity.IdentityId);

    // If the user doesn't exist yet, create him
    if (!user) {
      await db.AddUser({identityId: cognitoIdentity.IdentityId, refresh_token, spotifyId: profile.id});
      let res = await ecs.GetLibrary(cognitoIdentity.IdentityId);

      console.log(`[/auth?identityId=${cognitoIdentity.IdentityId}]: ECS Task ${JSON.stringify(res, null, 2)}`);
    }
  }

  return {profile, cognitoIdentity};
});

/**
* returns a list of booleans indicating if a track was saved
*/
api.post('/track/is-saved', async (req) => {
  let {identityId, ids} = req.body;
  return await spotify.IsTrackSaved(identityId, ids);
});

/**
* Saves a track id to the users spotify library
*/
api.post('/track/save', async (req) => {
  let {identityId, ids} = req.body;
  return await spotify.SaveTrack(identityId, ids);
});

/**
* Removes a track id from the users spotify library
*/
api.post('/track/remove', async (req) => {
  let {identityId, ids} = req.body;
  return await spotify.RemoveTrack(identityId, ids);
});
