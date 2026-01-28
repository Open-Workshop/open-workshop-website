from aiohttp import ClientSession
from flask import request, make_response, render_template
import ow_config as config
import asyncio


class UserHandler:
    def __init__(self):
        self.session = None
        self.cookies = None
        self.cookie_params = {}
        self.changed_cookies = {}

        self.id = None
        self.profile = None
        self.rights = {}

    async def __aenter__(self):
        self.session = ClientSession()
        self.cookies = request.cookies
        for key in request.cookies.keys():
            self.cookie_params[key] = {}
        await self._initialize_profile()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.session.close()

    async def _initialize_profile(self):
        """
        Initializes the profile by fetching profile information based on the user ID.
        If the user ID or required tokens are missing, sets the id to -1 and profile to False.
        Fetches profile information and sets the user ID and profile data accordingly.
        """
        uid = self.cookies.get('userID', None)
        if not uid or (not self.cookies.get('refreshToken', None) and not self.cookies.get('accessToken', None)):
            self.id = -1
            self.profile = False
            return
        
        code, result = await self.fetch(f"/profile/info/{uid}?general=true&rights=true")
        
        if code == 200 and isinstance(result, dict):
            avatar_url = result['general'].get('avatar_url', '')
            if not avatar_url:
                result['general']['avatar_url'] = "/assets/images/no-avatar.jpg"
            elif avatar_url.startswith("local"):
                result['general']['avatar_url'] = f"/api/manager/profile/avatar/{uid}"
            
            self.id = uid
            self.profile = result.get('general', False)
            self.rights = result.get('rights', {})
        else:
            self.id = -1
            self.profile = False

    def access_to_mod(self, my_mod: bool = False, owner_mod: bool = False) -> dict:
        access = {
            "add": False,
            "edit": False,
            "delete": False,
            "admin": False, # Является ли спрашивающий админом
            "is_my_mod": 2, # 0 - мой мод, 1 - соавтор мода, 2 - не мой мод
            "in_mute": False
        }

        if len(self.rights) > 0:
            access["in_mute"] = self.profile["mute"]
            access["admin"] = self.rights["admin"]

            access["is_my_mod"] = 1 if owner_mod else 0 if my_mod else 2

            if access["admin"]:
                access["add"] = True
                access["edit"] = True
                access["delete"] = True
            elif not access["in_mute"]:
                access["add"] = self.rights["publish_mods"]
                if access["is_my_mod"] < 2: # Мой мод
                    access["edit"] = self.rights["change_self_mods"]
                    access["delete"] = self.rights["delete_self_mods"] and access["is_my_mod"] == 0
                else: # Чужой мод
                    access["edit"] = self.rights["change_mods"]
                    access["delete"] = self.rights["delete_mods"]

        access['any'] = access['add'] or access['edit'] or access['delete'] or access['admin'] or access['is_my_mod'] <= 1

        return access

    def access_to_profile(self, target_profile: int) -> dict:
        access = {
            "my": self.id == target_profile,
            "admin": self.profile["admin"],
            "grade": access["admin"]
        }
        for key in ["change_username", "change_about", "change_avatar"]: #  "mute_users"
            access[key] = (self.profile[key] and not self.profile["mute"] and access["my"]) or self.rights["admin"]
        access["mute_users"] = ((not self.profile["mute"] and self.rights["mute_users"]) or self.rights["admin"]) and not access["my"]
        access["any"] = access["mute_users"] or access["grade"] or access["change_username"] or access["change_about"] or access["change_avatar"]

        return access

    async def fetch(self, url: str, method: str = 'GET', data: dict = None, headers: dict = None) -> tuple[int, str | dict | list]:
        """
        Fetches data from the specified URL using the provided method and sends any provided data and headers.
        Updates the cookies with any changes made by the server.
        
        Args:
            url (str): The URL to fetch data from. If the URL does not start with 'http://' or 'https://', it will be prepended with the manager address.
            method (str, optional): The HTTP method to use. Defaults to 'GET'.
            data (dict, optional): The data to send with the request. Defaults to None.
            headers (dict, optional): The headers to send with the request. Defaults to None.
        
        Returns:
            tuple[int, str | dict | list]: A tuple containing the status code of the response and the content of the response.
                The content can be a string, a dictionary, or a list, depending on the 'Content-Type' header of the response.
        """
        if not url.startswith('http://') and not url.startswith('https://'):
            if not url.startswith('/'):
                url = '/' + url
            url = config.MANAGER_ADDRESS + url

        async with self.session.request(method, url, data=data, headers=headers, cookies=self.cookies) as response:
            # Обновление только изменившихся кук
            for key, cookie in response.cookies.items():
                self.cookies[key] = cookie.value
                self.changed_cookies[key] = cookie
                # Обновляем параметры куки, если они есть
                self.cookie_params[key] = {
                    'max_age': cookie.get('max-age'),
                    'secure': cookie.get('secure'),
                    'httponly': cookie.get('httponly'),
                    'path': cookie.get('path', '/'),
                    'domain': cookie.get('domain'),
                    'samesite': cookie.get('samesite'),
                }

            if response.headers.get('Content-Type') == 'application/json':
                content = await response.json()
            else:
                content = await response.text()
            
            return response.status, content

    def render(self, filename: str, **kwargs) -> str:
        return render_template(filename, user_profile=self.profile, **kwargs)

    def finish(self, page: str) -> make_response:
        """
        Finish the request by setting cookies and returning a response.

        Args:
            page (str): The text of the response.

        Returns:
            make_response: The response object with cookies set.

        This function takes the response text and creates a response object. It then iterates over the changed cookies and sets each cookie in the response object with the corresponding parameters. The parameters are obtained from the `self.cookie_params` dictionary. Finally, it returns the response object.
        """
        response = make_response(page)
        for key, cookie in self.changed_cookies.items():
            params = self.cookie_params.get(key, {})
            response.set_cookie(key, cookie.value,
                                max_age=params.get('max_age'),
                                secure=params.get('secure'),
                                httponly=params.get('httponly'),
                                path=params.get('path', '/'),
                                domain=params.get('domain'),
                                samesite=params.get('samesite'))
        return response
