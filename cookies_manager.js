function setCookie(cookie_name, cookie_value) {
    var dateNow = new Date();
    dateNow.setTime(dateNow.getTime() + (6 * 30 * 24 * 60 * 60 * 1000)); // 6 months
    var expires = "expires="+dateNow.toUTCString();
    document.cookie = cookie_name + "=" + cookie_value + ";" + expires + ";path=/";
}

function getCookie(cookie_name) {
    var name = cookie_name + "=";
    var cookies = decodeURIComponent(document.cookie);
    var ca = cookies.split(';');
    for(var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return false;
}