const direction = {};
let routeCandidates = [];
let paymentInfo = {};

const fauna = new faunadb.Client({ secret: 'fnADkpdWVHACCjDqtIAcKJmVzYK4uIJW-wvYfURK' });
const query = faunadb.query;

angular.module('prepay', ['onsen', 'lang'])
    .controller('StopSelectorCtrl', function ($scope) {
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
            const findStop = async name => await fauna.query(
                query.Select('data',
                    query.Map(
                        query.Paginate(
                            query.Match(query.Index('stops_by_stopname'), name)
                        ),
                        query.Lambda('x', query.Select('data', query.Get(query.Var('x'))))
                    )
                )
            );

            const fromCandidates = await findStop(direction.from.stopName);
            const toCandidates = await findStop(direction.to.stopName);

            paymentConfirm.show();
            this.amount = null;

            for (let origin of fromCandidates) {
                for (let destination of toCandidates) {
                    const data = await fauna.query(
                        query.Map(
                            query.Paginate(
                                query.Match(query.Index('farerules_by_originid_and_destinationid'), [origin.stopId, destination.stopId])
                            ),
                            query.Lambda('x', query.Select('data', query.Get(query.Var('x'))))
                        )
                    );

                    routeCandidates.push(data.data);
                }
            }
            routeCandidates = routeCandidates.flat();
            let fareResult = [];
            for (let rule of routeCandidates) {
                const fare = await fauna.query(
                    query.Map(
                        query.Paginate(
                            query.Match(query.Index('fares_by_fareid'), rule.fareId)
                        ),
                        query.Lambda('x', query.Select('data', query.Get(query.Var('x'))))
                    )
                );

                fareResult.push(fare.data);
            }

            fareResult = fareResult.flat().sort((a, b) => a.price - b.price);

            if (fareResult.length) {
                $scope.$apply(() => {
                    this.amount = Math.round(fareResult[0].price * (this.adults * 2 + this.children) / 20 + .49) * 10;
                    paymentInfo = {
                        amount: this.amount,
                        adults: this.adults,
                        children: this.children
                    };
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
    .controller('MapCtrl', function ($scope) {
        this.activeStop = null;
        let activeMarker = null;

        const getName = async (name, lang) => {
            const data = await fauna.query(
                query.Map(
                    query.Paginate(
                        query.Match(query.Index('translations_by_transid_and_lang'), [name, lang])
                    ),
                    query.Lambda('x', query.Select('data', query.Get(query.Var('x'))))
                )
            );
            return data.data.flat();
        };

        setTimeout(() => {
            const map = new google.maps.Map(document.getElementById('map'), {
                center: { lat: 34.2487733, lng: 132.4900538 },
                zoom: 15
            });

            let tmr = 0;
            const markerList = new Map();

            const plotPoints = async () => {
                const bound = map.getBounds();
                const ne = bound.getNorthEast(), sw = bound.getSouthWest();

                // console.log(sw.lat(), sw.lng(), ne.lat(), ne.lng());

                const stops = await fauna.query(
                    query.Map(
                        query.Intersection(
                            query.Select('data',
                                query.Map(
                                    query.Paginate(
                                        query.Match(query.Index('stops_by_lon')),
                                        { after: sw.lng(), size: 300 }
                                    ),
                                    query.Lambda('x', query.Select(1, query.Var('x')))
                                )
                            ),
                            query.Select('data',
                                query.Map(
                                    query.Paginate(
                                        query.Match(query.Index('stops_by_lat')),
                                        { after: sw.lat(), size: 300 }
                                    ),
                                    query.Lambda('x', query.Select(1, query.Var('x')))
                                )
                            ),

                            query.Difference(
                                query.Select('data',
                                    query.Map(
                                        query.Paginate(
                                            query.Match(query.Index('all_stops')),
                                            { size: 300 }
                                        ),
                                        query.Lambda('x', query.Var('x'))
                                    )
                                ),
                                query.Select('data',
                                    query.Map(
                                        query.Paginate(
                                            query.Match(query.Index('stops_by_lat')),
                                            { after: ne.lat(), size: 300 }
                                        ),
                                        query.Lambda('x', query.Var('x'))
                                    )
                                )
                            ),
                            query.Difference(
                                query.Select('data',
                                    query.Map(
                                        query.Paginate(
                                            query.Match(query.Index('all_stops')),
                                            { size: 300 }
                                        ),
                                        query.Lambda('x', query.Var('x'))
                                    )
                                ),
                                query.Select('data',
                                    query.Map(
                                        query.Paginate(
                                            query.Match(query.Index('stops_by_lon')),
                                            { after: ne.lng(), size: 300 }
                                        ),
                                        query.Lambda('x', query.Var('x'))
                                    )
                                )
                            )
                        ),
                        query.Lambda('x', query.Select('data', query.Get(query.Var('x'))))
                    )
                );

                for (let stop of stops) {
                    const latLng = new google.maps.LatLng(stop.stopLat, stop.stopLon);

                    if (!markerList.has(latLng)) {
                        markerList.set(latLng, true);

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
                }
            };


            map.addListener('center_changed', async () => {
                clearTimeout(tmr);
                tmr = setTimeout(await plotPoints, 500);
            });
            setTimeout(plotPoints, 500);

        }, 700);

        this.setStop = () => {
            direction[sessionStorage.getItem('direction')] = this.activeStop;
            nav.popPage();
        };
    })
    .controller('RidingCtrl', function ($scope) {
        if (Notification.permission !== 'granted') {
            requestNotificationPermission.show();
        }

        this.direction = direction;

        const init = async () => {
            const data = await fauna.query(
                query.Take(1, query.Intersection(
                    query.Select('data',
                        query.Map(
                            query.Paginate(
                                query.Match(query.Index('stoptimes_by_stopid_uniq_tripid'), direction.from.stopId),
                                { size: 100 }
                            ),
                            query.Lambda('x', query.Select(1, query.Var('x')))
                        )),
                    query.Select('data',
                        query.Map(
                            query.Paginate(
                                query.Match(query.Index('stoptimes_by_stopid_uniq_tripid'), direction.to.stopId),
                                { size: 100 }
                            ),
                            query.Lambda('x', query.Select(1, query.Var('x')))
                        )
                    )
                ))
            );

            const trip = await fauna.query(
                query.Select('data',
                    query.Map(
                        query.Paginate(
                            query.Union(
                                query.Match(query.Index('stoptimes_by_stopid_and_tripid'), [direction.from.stopId, data[0]]),
                                query.Match(query.Index('stoptimes_by_stopid_and_tripid'), [direction.to.stopId, data[0]])
                            ),
                            { size: 2 }
                        ),
                        query.Lambda('x', query.Select('data', query.Get(query.Var('x'))))
                    )
                )
            );
            console.log(trip);

            $scope.$apply(() => {
                this.busDisplay = trip[0].stopHeadsign;
                this.remainingStops = trip[1].stopSequence - trip[0].stopSequence;
                this.eta = (new Date(`2020/2/16 ${trip[1].departureTime}`) - new Date(`2020/2/16 ${trip[0].arrivalTime}`)) / 60000;
            });
        };

        this.decrease = tr => {
            this.remainingStops--;
            if (this.remainingStops === 1) {
                new Notification(
                    tr.notification.title, {
                    body: tr.notification.body.prefix + direction.to.name + tr.notification.body.suffix,
                    lang: localStorage.getItem('lang')
                });
            }

            if (this.remainingStops === 0) {
                nav.pushPage('pages/arrival.html');
            }
        };

        init();
    })
    .controller('ArrivalCtrl', function () {
        this.direction = direction;
        this.payment = paymentInfo;
        this.date = new Date();
    })
