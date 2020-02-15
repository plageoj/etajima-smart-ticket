angular.module("lang", [])
    .controller("LangCtrl", ["$scope", "$http", "$timeout", function ($scope,
        $http, $timeout) {
        var ln;
        $timeout(function () {
            if (ln = localStorage.getItem('lang')) {
                getLang(ln);
            }
            else {
                if (navigator.globalization) {
                    navigator.globalization.getLocaleName(function (lang) {
                        ln = lang.value.substr(0, 2);
                        getLang(ln);
                    }, function () {
                        getLang("en");
                    });
                } else {
                    localStorage.setItem('lang', navigator.language);
                    getLang(navigator.language);
                }
            }
        }, 1000);
        var getLang = function (code) {
            console.log('requesting ' + code)
            $http.get("lang/" + code + ".json")
                .then(function (d) {
                    $scope.tr = d.data;
                    $scope.tr.setLang = function (code) {
                        localStorage.setItem('lang', code);
                        getLang(code);
                    };
                }, function () {
                    getLang("en");
                });
        };
        getLang("ja");
    }])