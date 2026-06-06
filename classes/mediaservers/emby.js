const axios = require('axios');
const mediaCard = require('./../cards/MediaCard');
const cType = require('./../cards/CardType');
const core = require('./../core/cache');

class Emby {
  constructor({ HTTPS, embyIP, embyPort, embyToken }) {
    this.https = HTTPS === 'true';
    this.embyIP = embyIP;
    this.embyPort = embyPort;
    this.embyToken = embyToken;
    this.baseUrl = `${this.https ? 'https' : 'http'}://${embyIP}:${embyPort}`;
  }

  _url(path) {
    return `${this.baseUrl}${path}`;
  }

  _headers() {
    return { 'X-Emby-Token': this.embyToken };
  }

  _ratingColour(contentRating) {
    if (!contentRating) return 'badge-dark';
    switch (contentRating.toLowerCase()) {
      case 'nr':
      case 'unrated':
        return 'badge-dark';
      case 'g':
      case 'tv-g':
      case 'tv-y':
        return 'badge-success';
      case 'pg':
      case 'tv-pg':
      case 'tv-y7':
        return 'badge-info';
      case 'pg-13':
      case 'tv-14':
        return 'badge-warning';
      case 'tv-ma':
      case 'r':
        return 'badge-danger';
      default:
        return 'badge-dark';
    }
  }

  async GetNowScreening(playThemes, playGenericThemes, hasArt, filterRemote, filterLocal, filterDevices, filterUsers, hideUser, excludeLibs, filterUserMode) {
    let sessions;
    try {
      const resp = await axios.get(this._url('/Sessions'), { headers: this._headers() });
      sessions = resp.data;
    } catch (err) {
      const now = new Date();
      console.log(now.toLocaleString() + ' *Emby Now Screening - Get sessions: ' + err);
      throw err;
    }

    const nsCards = [];

    let devices = (filterDevices || '').toLowerCase().replace(', ', ',').replace(' ,', ',').split(',');
    let users = (filterUsers || '').toLowerCase().replace(', ', ',').replace(' ,', ',').split(',');

    for (const session of sessions) {
      if (!session.NowPlayingItem) continue;

      const item = session.NowPlayingItem;
      const playState = session.PlayState || {};
      const medCard = new mediaCard();

      const durationMs = item.RunTimeTicks ? item.RunTimeTicks / 10000 : 0;
      const positionMs = playState.PositionTicks ? playState.PositionTicks / 10000 : 0;
      const contentRating = item.OfficialRating || 'NR';

      const remoteIP = session.RemoteEndPoint || '';
      const isLocal = !remoteIP || remoteIP.startsWith('192.168') || remoteIP.startsWith('10.') || remoteIP.startsWith('172.16') || remoteIP === '127.0.0.1';

      // apply remote/local filter
      let okToAdd = false;
      if (filterRemote === 'true' && !isLocal) okToAdd = true;
      if (filterLocal === 'true' && isLocal) okToAdd = true;
      if (filterRemote !== 'true' && filterLocal !== 'true') okToAdd = true;

      const userName = (session.UserName || '').toLowerCase();
      const deviceName = (session.DeviceName || '').toLowerCase();
      if (users.length > 0 && users[0] !== '') {
        const userMatch = users.includes(userName);
        if (filterUserMode === 'exclude' && userMatch) okToAdd = false;
        if (filterUserMode !== 'exclude' && !userMatch) okToAdd = false;
      }
      if (devices.length > 0 && devices[0] !== '' && !devices.includes(deviceName)) okToAdd = false;

      if (!okToAdd) continue;

      switch (item.Type) {
        case 'Movie': {
          medCard.title = item.Name;
          medCard.tagLine = item.Taglines && item.Taglines.length > 0 ? item.Taglines[0] : '';
          medCard.mediaType = 'movie';
          medCard.cardType = cType.CardTypeEnum.NowScreening;
          medCard.posterAR = 1.5;
          medCard.rating = item.CommunityRating ? Math.round(item.CommunityRating * 10) + '%' : '';

          const fileName = 'emby-' + item.Id + '.jpg';
          if (item.ImageTags && item.ImageTags.Primary) {
            const imgUrl = this._url('/Items/' + item.Id + '/Images/Primary?api_key=' + this.embyToken);
            await core.CacheImage(imgUrl, fileName);
            medCard.posterURL = '/imagecache/' + fileName;
          }

          if (hasArt === 'true' && item.BackdropImageTags && item.BackdropImageTags.length > 0) {
            const artFileName = 'emby-' + item.Id + '-art.jpg';
            const artUrl = this._url('/Items/' + item.Id + '/Images/Backdrop/0?api_key=' + this.embyToken);
            await core.CacheImage(artUrl, artFileName);
            medCard.posterArtURL = '/imagecache/' + artFileName;
          }

          if (item.MediaStreams) {
            const v = item.MediaStreams.find(s => s.Type === 'Video');
            const a = item.MediaStreams.find(s => s.Type === 'Audio');
            if (v) medCard.resCodec = (v.DisplayTitle || v.Codec || '').replace(/[()]/g, '').trim();
            if (a) medCard.audioCodec = (a.DisplayTitle || a.Codec || '').replace(/[()]/g, '').trim();
          }
          break;
        }
        case 'Episode': {
          medCard.title = item.SeriesName || item.Name;
          medCard.episodeName = item.Name;
          medCard.tagLine = (item.SeriesName || '') + ', Episode ' + (item.IndexNumber || '') + " - '" + item.Name + "'";
          medCard.mediaType = 'episode';
          medCard.cardType = cType.CardTypeEnum.NowScreening;
          medCard.posterAR = 1.5;
          medCard.rating = item.CommunityRating ? Math.round(item.CommunityRating * 10) + '%' : '';

          const seriesId = item.SeriesId || item.Id;
          const fileName = 'emby-' + seriesId + '.jpg';
          const imgUrl = this._url('/Items/' + seriesId + '/Images/Primary?api_key=' + this.embyToken);
          await core.CacheImage(imgUrl, fileName);
          medCard.posterURL = '/imagecache/' + fileName;

          if (hasArt === 'true') {
            const backdropId = item.ParentBackdropItemId || seriesId;
            const artFileName = 'emby-' + seriesId + '-art.jpg';
            const artUrl = this._url('/Items/' + backdropId + '/Images/Backdrop/0?api_key=' + this.embyToken);
            await core.CacheImage(artUrl, artFileName);
            medCard.posterArtURL = '/imagecache/' + artFileName;
          }

          if (item.MediaStreams) {
            const v = item.MediaStreams.find(s => s.Type === 'Video');
            const a = item.MediaStreams.find(s => s.Type === 'Audio');
            if (v) medCard.resCodec = (v.DisplayTitle || v.Codec || '').replace(/[()]/g, '').trim();
            if (a) medCard.audioCodec = (a.DisplayTitle || a.Codec || '').replace(/[()]/g, '').trim();
          }
          break;
        }
        case 'Audio': {
          medCard.title = item.Name;
          medCard.tagLine = item.Name + ', ' + (item.AlbumArtist || '') + ' (' + (item.Album || '') + ')';
          medCard.mediaType = 'track';
          medCard.cardType = cType.CardTypeEnum.Playing;
          medCard.posterAR = 1;

          const albumId = item.AlbumId || item.Id;
          const fileName = 'emby-' + albumId + '.jpg';
          const imgUrl = this._url('/Items/' + albumId + '/Images/Primary?api_key=' + this.embyToken);
          await core.CacheImage(imgUrl, fileName);
          medCard.posterURL = '/imagecache/' + fileName;
          break;
        }
        default:
          continue;
      }

      if (hideUser !== 'true') {
        medCard.user = session.UserName || '';
        medCard.device = session.DeviceName || '';
      }

      medCard.runTime = Math.round(durationMs / 60000);
      medCard.progress = Math.round(positionMs / 60000);
      medCard.progressPercent = durationMs > 0 ? Math.round((positionMs / durationMs) * 100) : 0;
      medCard.runDuration = Math.round(durationMs / 600) / 100;
      medCard.runProgress = Math.round(positionMs / 600) / 100;
      medCard.contentRating = contentRating;
      medCard.playerDevice = session.DeviceName || '';
      medCard.playerIP = remoteIP;
      medCard.playerLocal = isLocal;
      medCard.decision = playState.PlayMethod === 'Transcode' ? 'transcode' : 'direct';
      medCard.ratingColour = this._ratingColour(contentRating);
      medCard.genre = item.Genres ? item.Genres.map(g => ({ tag: g })) : [];
      medCard.summary = item.Overview || '';

      nsCards.push(medCard);
    }

    return nsCards;
  }

  async GetOnDemand(onDemandLibraries, numberOnDemand, playThemes, playGenericThemes, hasArt, genres, recentlyAdded, contentRatings) {
    const odCards = [];
    if (!onDemandLibraries || onDemandLibraries.trim() === '') return odCards;

    const libs = onDemandLibraries.split(',').map(l => l.trim()).filter(Boolean);
    if (libs.length === 0) return odCards;

    let folders;
    try {
      const resp = await axios.get(this._url('/Library/VirtualFolders'), { headers: this._headers() });
      folders = resp.data;
    } catch (err) {
      const now = new Date();
      console.log(now.toLocaleString() + ' *Emby On-demand - Get library folders: ' + err);
      throw err;
    }

    for (const libName of libs) {
      const folder = folders.find(f => f.Name.toLowerCase() === libName.toLowerCase());
      if (!folder) {
        console.log('✘✘ WARNING ✘✘ - Emby On-demand library \'' + libName + '\' not found');
        continue;
      }

      try {
        const params = {
          ParentId: folder.ItemId,
          IncludeItemTypes: 'Movie,Series',
          Recursive: true,
          Limit: parseInt(numberOnDemand) * 5,
          SortBy: 'Random',
          Fields: 'Overview,Genres,OfficialRating,CommunityRating,BackdropImageTags,ImageTags,RunTimeTicks'
        };

        if (genres && genres.trim() !== '') params.Genres = genres;

        const itemsResp = await axios.get(this._url('/Items'), { headers: this._headers(), params });
        const items = (itemsResp.data.Items || []).slice(0, parseInt(numberOnDemand));

        for (const item of items) {
          const medCard = new mediaCard();
          medCard.title = item.Name;
          medCard.tagLine = item.Name;
          medCard.mediaType = item.Type === 'Movie' ? 'movie' : 'show';
          medCard.cardType = cType.CardTypeEnum.OnDemand;
          medCard.posterAR = 1.47;
          medCard.rating = item.CommunityRating ? Math.round(item.CommunityRating * 10) + '%' : '';
          medCard.summary = item.Overview || '';
          medCard.genre = item.Genres ? item.Genres.map(g => ({ tag: g })) : [];
          medCard.contentRating = item.OfficialRating || 'NR';
          medCard.ratingColour = this._ratingColour(item.OfficialRating);
          medCard.runTime = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10000 / 60000) : 0;

          if (item.ImageTags && item.ImageTags.Primary) {
            const fileName = 'emby-' + item.Id + '.jpg';
            const imgUrl = this._url('/Items/' + item.Id + '/Images/Primary?api_key=' + this.embyToken);
            await core.CacheImage(imgUrl, fileName);
            medCard.posterURL = '/imagecache/' + fileName;
          }

          if (hasArt === 'true' && item.BackdropImageTags && item.BackdropImageTags.length > 0) {
            const artFileName = 'emby-' + item.Id + '-art.jpg';
            const artUrl = this._url('/Items/' + item.Id + '/Images/Backdrop/0?api_key=' + this.embyToken);
            await core.CacheImage(artUrl, artFileName);
            medCard.posterArtURL = '/imagecache/' + artFileName;
          }

          odCards.push(medCard);
        }
      } catch (err) {
        const now = new Date();
        console.log(now.toLocaleString() + ' *Emby On-demand - Get items from \'' + libName + '\': ' + err);
      }
    }

    const now = new Date();
    if (odCards.length === 0) {
      console.log(now.toLocaleString() + ' No Emby On-demand titles available');
    } else {
      console.log(now.toLocaleString() + ' Emby On-demand titles refreshed (' + onDemandLibraries + ')');
    }

    return odCards;
  }
}

module.exports = Emby;
