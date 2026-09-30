on open location rawURL
	set streamURL to my decodeVLCURL(rawURL as text)
	if streamURL is "" then return
	do shell script "/usr/bin/open -a " & quoted form of "VLC" & " " & quoted form of streamURL
end open location

on decodeVLCURL(rawURL)
	if rawURL starts with "vlc://weblink?url=" then
		set encodedURL to text ((length of "vlc://weblink?url=") + 1) thru -1 of rawURL
		set AppleScript's text item delimiters to "&"
		set encodedURL to text item 1 of encodedURL
		set AppleScript's text item delimiters to ""
		return do shell script "/usr/bin/python3 -c " & quoted form of "import sys, urllib.parse; print(urllib.parse.unquote(sys.argv[1]))" & " " & quoted form of encodedURL
	end if

	if rawURL starts with "vlc://http//" then
		return "http://" & text ((length of "vlc://http//") + 1) thru -1 of rawURL
	end if

	if rawURL starts with "vlc://https//" then
		return "https://" & text ((length of "vlc://https//") + 1) thru -1 of rawURL
	end if

	if rawURL starts with "vlc://http://" then
		return text ((length of "vlc://") + 1) thru -1 of rawURL
	end if

	if rawURL starts with "vlc://https://" then
		return text ((length of "vlc://") + 1) thru -1 of rawURL
	end if

	return rawURL
end decodeVLCURL
