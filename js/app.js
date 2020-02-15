let stops = [];
const direction = {};
let routeCandidates = [];

const fauna = new faunadb.Client({ secret: 'fnADkpdWVHACCjDqtIAcKJmVzYK4uIJW-wvYfURK' });
const query = faunadb.query;

angular.module('prepay', ['onsen', 'lang'])
    .controller('StopSelectorCtrl', function ($http, $scope) {
        $http.get('https://v2-api.sheety.co/1a49d70e79b66071f353ae977cd0e2fb/%E3%83%90%E3%82%B9%E5%81%9C/stop').then(
            data => {
                stops = data.data.stop.map(d => {
                    delete d.stop_code;
                    delete d.stop_desc;
                    delete d.stop_url;
                    return d;
                });
            }
        );

        this.direction = direction;
        this.adults = 1;
        this.children = 0;

        const openMap = () => {
            nav.once('postpop', () => {
                $scope.$apply(() => {
                    this.direction[sessionStorage.getItem('direction')] = direction[sessionStorage.getItem('direction')];
                });
            });
            nav.pushPage('pages/map.html');
        };

        this.setFrom = () => {
            sessionStorage.setItem('direction', 'from');
            openMap();
        };

        this.setTo = () => {
            sessionStorage.setItem('direction', 'to');
            openMap();
        };

        this.proceed = async () => {
            const findStop = name => stops.filter(sp => sp.stopName === name);

            const fromCandidates = findStop(direction.from.stopName);
            const toCandidates = findStop(direction.to.stopName);

            const fares = {};

            paymentConfirm.show();
            this.amount = null;

            const data = await $http.get('https://v2-api.sheety.co/1a49d70e79b66071f353ae977cd0e2fb/%E3%83%90%E3%82%B9%E5%81%9C/fare');
            for (let fare of data.data.fare) {
                fares[fare.fareId] = fare.price;
            }

            let fareResult = [];

            for (let origin of fromCandidates) {
                const data = await $http.get('https://v2-api.sheety.co/1a49d70e79b66071f353ae977cd0e2fb/バス停/fareRule', {
                    params: {
                        originId: origin.stopId
                    }
                })
                const rules = data.data.fareRule;
                for (let destination of toCandidates) {
                    const fareCandidates = rules.filter(rl => rl.destinationId === destination.stopId)
                        .map(rl => {
                            rl.fare = fares[rl.fareId];
                            return rl;
                        });
                    fareResult.push(...fareCandidates);
                }
            }
            fareResult = fareResult.sort((a, b) => a.fare - b.fare);
            routeCandidates = fareResult;

            if (fareResult.length) {
                $scope.$apply(() => {
                    this.amount = Math.round(fareResult[0].fare * (this.adults * 2 + this.children) / 20 + .49) * 10;
                });
            } else {
                paymentConfirm.hide();
                noRoutesToast.show();
                setTimeout(() => {
                    noRoutesToast.hide();
                }, 1500);
            }
        };

        this.purchase = () => {
            nav.pushPage('pages/riding.html');
        };
    })
    .controller('MapCtrl', function ($scope, $http) {
        this.activeStop = null;
        let activeMarker = null;

        const getName = async (name, lang) => {
            const data = await $http.get('https://v2-api.sheety.co/1a49d70e79b66071f353ae977cd0e2fb/バス停/translations', {
                params: {
                    transId: name
                }
            })
            return data.data.translations.filter(tr => tr.lang === lang);
        };

        setTimeout(() => {
            const map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 34.2487733, lng: 132.4900538 },
                zoom: 15
            });

            for (let stop of stops) {
                const latLng = new google.maps.LatLng(stop.stopLat, stop.stopLon);
                const marker = new google.maps.Marker({
                    position: latLng,
                    map: map,
                    title: stop.stopName
                });
                marker.addListener('click', () => {
                    $scope.$apply(() => {
                        this.activeStop = stop;
                    });
                    getName(stop.stopName, localStorage.getItem('lang')).then(data => {
                        $scope.$apply(() => {
                            stop.name = data[0].translation;
                        });
                    });
                    if (activeMarker) {
                        activeMarker.setAnimation(google.maps.Animation.NONE);
                    }
                    activeMarker = marker;
                    marker.setAnimation(google.maps.Animation.BOUNCE)
                });
            }
        }, 1000);

        this.setStop = () => {
            direction[sessionStorage.getItem('direction')] = this.activeStop;
            nav.popPage();
        };
    })
    .controller('RidingCtrl', function ($http, $scope) {
        if (Notification.permission !== 'granted') {
            requestNotificationPermission.show();
        }

        const init = async () => {
            for (let route of routeCandidates) {
                const data = await $http.get('https://v2-api.sheety.co/1a49d70e79b66071f353ae977cd0e2fb/バス停/stopTimes', { params: { stopId: route.originId } });

                data.data.stopTimes.filter(st => st);
            }
        };

        init();
    })
