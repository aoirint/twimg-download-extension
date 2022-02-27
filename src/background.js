
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    type: 'normal',
    id: 'start-download-tree',
    title: 'ツリーの画像をダウンロード（開始）',
    documentUrlPatterns: [
      'https://twitter.com/*/status/*',
    ]
  })
  chrome.contextMenus.create({
    type: 'normal',
    id: 'finish-download-tree',
    title: 'ツリーの画像をダウンロード（終了）',
    documentUrlPatterns: [
      'https://twitter.com/*/status/*',
    ]
  })
})

chrome.contextMenus.onClicked.addListener((item) => {
  if (item.menuItemId === 'start-download-tree') {
    chrome.tabs.query({
      active: true,
      currentWindow: true,
    }, ([activeTab]) => {
      const tabId = activeTab.id

      chrome.scripting.executeScript({
        target: {
          tabId: tabId
        },
        function: startDownloadTree,
        args: []
      })
    })
  }
  else if (item.menuItemId === 'finish-download-tree') {
    chrome.tabs.query({
      active: true,
      currentWindow: true,
    }, ([activeTab]) => {
      const tabId = activeTab.id

      chrome.scripting.executeScript({
        target: {
          tabId: tabId
        },
        function: finishDownloadTree,
        args: []
      })
    })
  }
})

function startDownloadTree() {
  if (window.TwingDownloader) {
    alert('すでにTwingDownloaderが開始されています')
    return
  }

  const tweetUrlPattern = /https:\/\/twitter\.com\/(.+)\/status\/(.+)/
  const rootMatch = location.href.match(tweetUrlPattern)

  const rootUsername = rootMatch[1]
  const rootTweetId = rootMatch[2]

  window.TwingDownloader = {
    'rootUsername': rootUsername,
    'rootTweetId': rootTweetId,
    'intervalId': null,
    'tweets': [],
  }

  window.TwingDownloader.intervalId = setInterval(() => {
    // 引用ツイート
    const isQuoted = (element) => {
      let parent = element.parentElement
      while (parent != null) {
        if (parent.classList.contains('r-adacv')) {
          return true
        }
        parent = parent.parentElement
      }
  
      return false
    }

    const tweetElements = document.querySelectorAll('[data-testid="tweet"]')
    for (const tweetElement of tweetElements) {
      const tweetUrlElement = tweetElement.querySelector('[href*="/status/"]:not([href*="/photo/"])')
      const tweetUrl = tweetUrlElement.href

      const childMatch = tweetUrl.match(tweetUrlPattern)
      const childUsername = childMatch[1]
      const childTweetId = childMatch[2]

      if (window.TwingDownloader.tweets.find((tweet) => tweet.tweetId === childTweetId)) {
        continue
      }

      // console.log(tweetUrlElement)

      const imgElements = [...tweetElement.querySelectorAll('[data-testid="tweetPhoto"] img')]
        .filter((element) => !isQuoted(element))

      if (imgElements.length > 4) throw Error('Too many image elements in a tweet')
      if (imgElements.length == 0) continue

      const imgSortIndexes = imgElements.length == 4 ? [0, 2, 1, 3] : (
        imgElements.length == 3 ? [0, 1, 2] : (
          imgElements.length == 2 ? [0, 1] : [0]
        )
      )

      const sortedImgElements = imgSortIndexes.map((index) => imgElements[index])

      let imgIndex = 0
      let images = []
      for (const imgElement of sortedImgElements) {
        const imgUrlObj = new URL(imgElement.src)
        imgUrlObj.searchParams.set('name', '4096x4096')
        const extension = imgUrlObj.searchParams.get('format')
        const basename = imgUrlObj.pathname.split('/').slice(-1)[0]
  
        const imgUrl = imgUrlObj.toString()
  
        const image = {
          imgUrl,
          imgIndex,
          basename,
          extension,
        }
        images.push(image)
  
        imgIndex += 1
      }

      const tweet = {
        'username': childUsername,
        'tweetId': childTweetId,
        'tweetY': tweetElement.getBoundingClientRect().top + window.scrollY,
        images,
      }
      window.TwingDownloader.tweets.push(tweet)
    }

    console.log(`TwingDownloader: Tweet ${window.TwingDownloader.tweets.length}, Image ${window.TwingDownloader.tweets.reduce((acc, cur) => acc + cur.images.length, 0)}`)
  }, 100)
}

function finishDownloadTree() {
  if (!window.TwingDownloader) {
    alert('TwingDownloaderが開始されていません')
    return
  }

  // stop interval
  clearInterval(window.TwingDownloader.intervalId)

  const rootUsername = window.TwingDownloader.rootUsername
  const rootTweetId = window.TwingDownloader.rootTweetId

  let tweets = [...window.TwingDownloader.tweets] // shallow copy
  tweets.sort((a, b) => a.tweetY - b.tweetY) // asc

  if (!confirm(`Download ${tweets.length} tweets, ${tweets.reduce((acc, cur) => acc + cur.images.length, 0)} images?`)) {
    return
  }

  const downloadAsync = (url, filename) => {
    return fetch(url)
      .then((response) => response.blob()) 
      .then((blob) => URL.createObjectURL(blob))
      .then((objectUrl) => {
        const downloadAnchor = document.createElement('a')
        document.body.appendChild(downloadAnchor)
        downloadAnchor.href = objectUrl
        downloadAnchor.download = filename
        downloadAnchor.click()
        downloadAnchor.remove()
      })
  }

  (async () => {
    let globalImgIndex = 0

    for (const tweet of tweets) {
      const username = tweet.username
      const tweetId = tweet.tweetId

      for (const image of tweet.images) {
        const imgUrl = image.imgUrl
        const basename = image.basename
        const extension = image.extension
        const zfilledImgIndex = new String(globalImgIndex).padStart(3, '0')

        await downloadAsync(imgUrl, `${rootUsername}_${rootTweetId}_${zfilledImgIndex}_${username}_${tweetId}_${basename}.${extension}`)
        globalImgIndex += 1

        await new Promise((resolve) => setTimeout(() => resolve(), 200))
      }
    }
  })()
}
