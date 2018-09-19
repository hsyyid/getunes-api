/**
* Util function to transform JSON object to url encoded format
*/
function urlEncode(obj) {
  return Object.keys(obj).map(function(key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(obj[key]);
  }).join("&");
}

/**
* Util function to compare two arrays
*/
function compareArrays(arrA, arrB) {
  if (arrA.length !== arrB.length)
    return false;

  var cA = arrA.slice().sort().join(",");
  var cB = arrB.slice().sort().join(",");

  return cA === cB;
}

/**
* Util function to split array into parts of n length
*/
function splitArray(arr, chunkSize) {
  var groups = [],
    i;
  for (i = 0; i < arr.length; i += chunkSize) {
    groups.push(arr.slice(i, i + chunkSize));
  }
  return groups;
}

module.exports = {
  urlEncode,
  compareArrays,
  splitArray
}
